import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createServer, type AddressInfo, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { AntivirusService, encoderFlux, interpreterReponse } from "./antivirus.service";

function service(port: number): AntivirusService {
  const valeurs = { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: port } as Record<string, unknown>;
  return new AntivirusService({ get: (cle: string) => valeurs[cle] } as unknown as ConfigService<Env, true>);
}

// Faux clamd : relit le flux INSTREAM et répond comme le vrai démon.
function fauxClamd(verdict: (contenu: Buffer) => string): Promise<{ serveur: Server; port: number; recus: Buffer[] }> {
  const recus: Buffer[] = [];
  const serveur = createServer((socket) => {
    let tampon = Buffer.alloc(0);
    socket.on("data", (donnees) => {
      tampon = Buffer.concat([tampon, donnees]);
      const entete = "zINSTREAM\0".length;
      const blocs: Buffer[] = [];
      let position = entete;
      while (position + 4 <= tampon.length) {
        const taille = tampon.readUInt32BE(position);
        if (taille === 0) {
          const contenu = Buffer.concat(blocs);
          recus.push(contenu);
          socket.end(`stream: ${verdict(contenu)}\0`);
          return;
        }
        if (position + 4 + taille > tampon.length) return;
        blocs.push(tampon.subarray(position + 4, position + 4 + taille));
        position += 4 + taille;
      }
    });
  });
  return new Promise((resolve) =>
    serveur.listen(0, "127.0.0.1", () => resolve({ serveur, port: (serveur.address() as AddressInfo).port, recus })),
  );
}

let ouvert: Server | undefined;
afterEach(() => {
  ouvert?.close();
  ouvert = undefined;
});

describe("protocole clamd", () => {
  it("interprète un fichier sain et un fichier infecté", () => {
    expect(interpreterReponse("stream: OK\0")).toEqual({ sain: true });
    expect(interpreterReponse("stream: Win.Test.EICAR_HDB-1 FOUND\0")).toEqual({ sain: false, menace: "Win.Test.EICAR_HDB-1" });
  });

  it("rejette une réponse inattendue (taille dépassée, erreur clamd)", () => {
    expect(() => interpreterReponse("INSTREAM size limit exceeded. ERROR")).toThrow(/inattendue/);
  });

  it("découpe le fichier en blocs préfixés par leur taille et termine par un bloc vide", () => {
    const flux = encoderFlux(Buffer.alloc(150 * 1024, 1));
    expect(flux[0]!.toString()).toBe("zINSTREAM\0");
    const tailles = flux.slice(1).filter((_, i) => i % 2 === 0).map((b) => b.readUInt32BE(0));
    expect(tailles).toEqual([65536, 65536, 22528, 0]);
  });
});

describe("AntivirusService", () => {
  it("transmet le fichier entier à clamd et renvoie son verdict", async () => {
    const clamd = await fauxClamd((contenu) => (contenu.includes("EICAR") ? "Eicar-Test-Signature FOUND" : "OK"));
    ouvert = clamd.serveur;
    const fichier = Buffer.alloc(200 * 1024, 7);

    expect(await service(clamd.port).analyser(fichier)).toEqual({ sain: true });
    expect(clamd.recus[0]!.equals(fichier)).toBe(true);
    expect(await service(clamd.port).analyser(Buffer.from("X5O!P%@AP EICAR test"))).toEqual({
      sain: false,
      menace: "Eicar-Test-Signature",
    });
  });

  it("refuse (503) plutôt que d'accepter sans analyse quand clamd est injoignable", async () => {
    const clamd = await fauxClamd(() => "OK");
    const port = clamd.port;
    clamd.serveur.close();

    await expect(service(port).analyser(Buffer.from("x"))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("refuse (503) une réponse illisible", async () => {
    const clamd = await fauxClamd(() => "quelque chose d'imprévu");
    ouvert = clamd.serveur;

    await expect(service(clamd.port).analyser(Buffer.from("x"))).rejects.toThrow(/momentanément indisponible/);
  });
});
