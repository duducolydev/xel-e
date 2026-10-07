import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, type Socket } from "node:net";
import type { Env } from "../config/env";

export type ResultatAnalyse = { sain: true } | { sain: false; menace: string };

const TAILLE_BLOC = 64 * 1024;
const DELAI_MS = 30_000;
export const MESSAGE_ANTIVIRUS_INDISPONIBLE =
  "L'analyse antivirus est momentanément indisponible : réessaie d'envoyer ton fichier dans quelques minutes.";

// Interprète la réponse de clamd à INSTREAM (« stream: OK », « stream: <menace> FOUND »).
export function interpreterReponse(reponse: string): ResultatAnalyse {
  const texte = reponse.replace(/\0/g, "").trim();
  if (/:\s*OK$/.test(texte)) return { sain: true };
  const menace = /:\s*(.+)\s+FOUND$/.exec(texte);
  if (menace) return { sain: false, menace: menace[1]!.trim() };
  throw new Error(`Réponse clamd inattendue : ${texte}`);
}

// Protocole INSTREAM : blocs préfixés par leur taille (4 octets big-endian), terminés par un bloc vide.
export function encoderFlux(contenu: Buffer): Buffer[] {
  const morceaux: Buffer[] = [Buffer.from("zINSTREAM\0")];
  for (let debut = 0; debut < contenu.length; debut += TAILLE_BLOC) {
    const bloc = contenu.subarray(debut, debut + TAILLE_BLOC);
    const taille = Buffer.alloc(4);
    taille.writeUInt32BE(bloc.length);
    morceaux.push(taille, bloc);
  }
  morceaux.push(Buffer.alloc(4));
  return morceaux;
}

// Analyse « fail-closed » : si l'antivirus ne répond pas, le fichier est refusé, jamais accepté.
@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);
  private readonly hote: string;
  private readonly port: number;

  constructor(config: ConfigService<Env, true>) {
    this.hote = config.get("CLAMAV_HOST", { infer: true });
    this.port = config.get("CLAMAV_PORT", { infer: true });
  }

  async analyser(contenu: Buffer): Promise<ResultatAnalyse> {
    try {
      return interpreterReponse(await this.envoyer(contenu));
    } catch (error) {
      this.logger.error(`Antivirus indisponible : ${(error as Error).message}`);
      throw new ServiceUnavailableException(MESSAGE_ANTIVIRUS_INDISPONIBLE);
    }
  }

  private envoyer(contenu: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const reponse: Buffer[] = [];
      const socket: Socket = connect({ host: this.hote, port: this.port });
      socket.setTimeout(DELAI_MS, () => socket.destroy(new Error("délai dépassé")));
      socket.on("connect", () => {
        for (const morceau of encoderFlux(contenu)) socket.write(morceau);
      });
      socket.on("data", (donnees) => reponse.push(donnees));
      socket.on("end", () => resolve(Buffer.concat(reponse).toString("utf8")));
      socket.on("error", reject);
    });
  }
}
