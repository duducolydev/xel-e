import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { StockageService } from "../contenus/stockage.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AntivirusService } from "./antivirus.service";
import { detecterFormat, nettoyerNom, PiecesJointesService } from "./pieces-jointes.service";
import { TermesService } from "./termes.service";

const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(32)]);
const PDF = Buffer.from("%PDF-1.4\n%contenu");

function creerPieces(verdict: { sain: true } | { sain: false; menace: string } = { sain: true }) {
  const prisma = {
    pieceJointe: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pj-1", ...data })),
      findUnique: vi.fn(),
    },
  };
  const stockage = { ecrire: vi.fn(), lire: vi.fn().mockResolvedValue({ corps: PNG, type: "image/png" }) };
  const antivirus = { analyser: vi.fn().mockResolvedValue(verdict) };
  const service = new PiecesJointesService(
    prisma as unknown as PrismaService,
    stockage as unknown as StockageService,
    antivirus as unknown as AntivirusService,
  );
  return { service, prisma, stockage, antivirus };
}

describe("pièces jointes — contrôle des fichiers", () => {
  it("reconnaît images et PDF par leurs premiers octets, rien d'autre", () => {
    expect(detecterFormat(PNG)?.type).toBe("image/png");
    expect(detecterFormat(Buffer.from("ffd8ffe000", "hex"))?.type).toBe("image/jpeg");
    expect(detecterFormat(Buffer.from("GIF89a...."))?.type).toBe("image/gif");
    expect(detecterFormat(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.type).toBe("image/webp");
    expect(detecterFormat(PDF)?.type).toBe("application/pdf");
    expect(detecterFormat(Buffer.from("<svg onload=alert(1)>"))).toBeUndefined();
    expect(detecterFormat(Buffer.from("MZ\x90\0"))).toBeUndefined();
  });

  it("nettoie le nom affiché et impose l'extension du type réel", () => {
    expect(nettoyerNom("Exercice  Thalès.png", "png")).toBe("Exercice Thalès.png");
    expect(nettoyerNom("../../etc/<script>.exe", "pdf")).toBe("....etcscript.pdf");
    expect(nettoyerNom("???", "jpg")).toBe("fichier.jpg");
  });

  it("analyse, stocke sous un nom aléatoire et enregistre un fichier sain", async () => {
    const { service, stockage, prisma } = creerPieces();

    const piece = await service.televerser({ octets: PNG, nom: "figure.png" }, "eleve-1");

    expect(piece).toEqual({ id: "pj-1", nom: "figure.png", type: "image/png", taille: PNG.length });
    expect(stockage.ecrire.mock.calls[0]?.[0]).toMatch(/^forum\/[0-9a-f-]{36}\.png$/);
    expect(prisma.pieceJointe.create.mock.calls[0]?.[0].data).toMatchObject({ auteurId: "eleve-1", type: "image/png" });
  });

  it("refuse un fichier infecté sans jamais le stocker (422)", async () => {
    const { service, stockage, prisma } = creerPieces({ sain: false, menace: "Eicar-Test-Signature" });

    await expect(service.televerser({ octets: PDF, nom: "cours.pdf" }, "eleve-1")).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(stockage.ecrire).not.toHaveBeenCalled();
    expect(prisma.pieceJointe.create).not.toHaveBeenCalled();
  });

  it("refuse un type non autorisé, un fichier vide ou trop lourd", async () => {
    const { service, antivirus } = creerPieces();

    await expect(service.televerser({ octets: Buffer.from("texte brut"), nom: "a.txt" }, "e")).rejects.toThrow(/images .* PDF/);
    await expect(service.televerser({ octets: Buffer.alloc(0), nom: "vide.png" }, "e")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.televerser({ octets: Buffer.alloc(5 * 1024 * 1024 + 1), nom: "gros.pdf" }, "e")).rejects.toThrow(/5 Mo/);
    expect(antivirus.analyser).toHaveBeenCalledTimes(1);
  });
});

describe("pièces jointes — lecture", () => {
  const piece = (message: unknown, auteurId = "eleve-1") => ({
    id: "pj-1",
    auteurId,
    cle: "forum/x.png",
    nomOriginal: "figure.png",
    type: "image/png",
    message,
  });
  const messageVisible = { masque: false, deletedAt: null, sujet: { deletedAt: null } };

  it("se lit quand son message est visible", async () => {
    const { service, prisma } = creerPieces();
    prisma.pieceJointe.findUnique.mockResolvedValue(piece(messageVisible));

    expect(await service.lire("pj-1", { id: "autre", role: "ELEVE" })).toMatchObject({ nom: "figure.png", type: "image/png" });
  });

  it("disparaît avec son message masqué ou supprimé, sauf pour son auteur et l'administration", async () => {
    const { service, prisma } = creerPieces();
    prisma.pieceJointe.findUnique.mockResolvedValue(piece({ ...messageVisible, masque: true }));

    await expect(service.lire("pj-1", { id: "autre", role: "ELEVE" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lire("pj-1", { id: "eleve-1", role: "ELEVE" })).resolves.toBeDefined();
    await expect(service.lire("pj-1", { id: "admin", role: "ADMIN" })).resolves.toBeDefined();
  });

  it("une pièce pas encore publiée n'est visible que de son auteur", async () => {
    const { service, prisma } = creerPieces();
    prisma.pieceJointe.findUnique.mockResolvedValue(piece(null));

    await expect(service.lire("pj-1", { id: "autre", role: "PROFESSEUR" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lire("pj-1", { id: "eleve-1", role: "ELEVE" })).resolves.toBeDefined();
  });

  it("404 si la pièce ou son fichier n'existent pas", async () => {
    const { service, prisma, stockage } = creerPieces();
    prisma.pieceJointe.findUnique.mockResolvedValue(null);
    await expect(service.lire("absente", { id: "e", role: "ELEVE" })).rejects.toBeInstanceOf(NotFoundException);

    prisma.pieceJointe.findUnique.mockResolvedValue(piece(messageVisible));
    stockage.lire.mockResolvedValue(null);
    await expect(service.lire("pj-1", { id: "e", role: "ELEVE" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("TermesService", () => {
  function creerTermes() {
    const prisma = {
      termeInterdit: {
        findMany: vi.fn().mockResolvedValue([{ terme: "connard" }]),
        create: vi.fn(async ({ data }: { data: { terme: string } }) => ({ id: "t-2", terme: data.terme })),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { service: new TermesService(prisma as unknown as PrismaService), prisma };
  }

  it("garde la liste en mémoire entre deux messages", async () => {
    const { service, prisma } = creerTermes();

    await service.termes();
    await service.termes();

    expect(prisma.termeInterdit.findMany).toHaveBeenCalledTimes(1);
  });

  it("ajoute un terme en minuscules et relit la liste aussitôt", async () => {
    const { service, prisma } = creerTermes();
    await service.termes();

    expect(await service.ajouter("  Insulte  ")).toEqual({ id: "t-2", terme: "insulte" });
    await service.termes();
    expect(prisma.termeInterdit.findMany).toHaveBeenCalledTimes(2);
  });

  it("refuse un doublon, même écrit autrement (accents, casse, chiffres)", async () => {
    const { service } = creerTermes();

    await expect(service.ajouter("C0NNARD")).rejects.toBeInstanceOf(ConflictException);
  });

  it("transforme une course à l'insertion en 409", async () => {
    const { service, prisma } = creerTermes();
    prisma.termeInterdit.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" }),
    );

    await expect(service.ajouter("nouveau")).rejects.toBeInstanceOf(ConflictException);
  });

  it("retire un terme, 404 s'il n'existe pas", async () => {
    const { service, prisma } = creerTermes();

    await service.retirer("t-1");
    prisma.termeInterdit.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.retirer("absent")).rejects.toBeInstanceOf(NotFoundException);
  });
});
