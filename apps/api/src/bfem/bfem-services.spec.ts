import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { StockageService } from "../contenus/stockage.service";
import type { AntivirusService } from "../forum/antivirus.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AccesPremiumService, MESSAGE_PREMIUM } from "./acces-premium.service";
import { AnnalesService, estUnPdf } from "./annales.service";
import { ExamensService } from "./examens.service";
import { delaiSoumission, MARGE_SOUMISSION_MS } from "./file-examens";
import { SuiviBfemService } from "./suivi-bfem.service";

const PDF = Buffer.from("%PDF-1.7\n%sujet");
const EPREUVES = [
  { id: "ep-fr", code: "FRANCAIS", libelle: "Français", matiere: null, dureeMinutes: null, coefficient: 3, aVerifier: true, ordre: 1 },
  { id: "ep-maths", code: "MATHS", libelle: "Mathématiques", matiere: "Maths", dureeMinutes: 120, coefficient: 4, aVerifier: false, ordre: 2 },
  { id: "ep-pc", code: "PC", libelle: "Sciences physiques", matiere: "PC", dureeMinutes: 60, coefficient: 2, aVerifier: true, ordre: 3 },
];

describe("AccesPremiumService", () => {
  function creer(abonnements: unknown[] = []) {
    const prisma = {
      abonnement: { findMany: vi.fn().mockResolvedValue(abonnements), create: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: "eleve-1" }) },
    };
    return { service: new AccesPremiumService(prisma as unknown as PrismaService), prisma };
  }

  it("un élève sans abonnement actif est refusé avec un message explicite", async () => {
    const { service } = creer();
    const lecteur = await service.lecteur({ id: "eleve-1", role: "ELEVE" });

    expect(lecteur).toEqual({ role: "ELEVE", abonne: false });
    expect(() => service.exiger({ premium: true }, lecteur)).toThrow(ForbiddenException);
    expect(() => service.exiger({ premium: true }, lecteur)).toThrow(MESSAGE_PREMIUM);
    expect(() => service.exiger({ premium: false }, lecteur)).not.toThrow();
  });

  it("l'administration est toujours considérée abonnée", async () => {
    const { service, prisma } = creer();

    expect(await service.lecteur({ id: "admin", role: "ADMIN" })).toEqual({ role: "ADMIN", abonne: true });
    expect(prisma.abonnement.findMany).not.toHaveBeenCalled();
  });

  it("l'admin accorde un accès Premium pour un nombre de jours", async () => {
    const { service, prisma } = creer();

    const { expireLe } = await service.accorder("fatou@example.sn", 30, new Date("2026-10-08T00:00:00Z"));

    expect(expireLe).toBe("2026-11-07T00:00:00.000Z");
    expect(prisma.user.findFirst.mock.calls[0]?.[0].where).toEqual({ OR: [{ email: "fatou@example.sn" }, { identifiant: "fatou@example.sn" }], deletedAt: null });
    expect(prisma.abonnement.create).toHaveBeenCalledWith({
      data: { utilisateurId: "eleve-1", plan: "PREMIUM_ACCORDE", statut: "ACTIF", expireLe: new Date("2026-11-07T00:00:00Z") },
    });
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.accorder("absent", 30)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AnnalesService", () => {
  function creer(options: { sain?: boolean; abonne?: boolean } = {}) {
    const prisma = {
      epreuveBfem: { findUnique: vi.fn(async ({ where }: { where: { code: string } }) => EPREUVES.find((e) => e.code === where.code) ?? null) },
      annale: {
        findMany: vi.fn().mockResolvedValue([
          { id: "a1", annee: 2025, titre: "Sujet 2025", premium: false, corrigeCle: "annales/c.pdf", epreuve: { code: "MATHS", libelle: "Mathématiques" } },
          { id: "a2", annee: 2024, titre: "Sujet 2024", premium: true, corrigeCle: null, epreuve: { code: "MATHS", libelle: "Mathématiques" } },
        ]),
        findFirst: vi.fn(),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "a3", ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      abonnement: { findMany: vi.fn().mockResolvedValue(options.abonne ? [{ statut: "ACTIF", expireLe: null }] : []) },
    };
    const stockage = { ecrire: vi.fn(), lire: vi.fn().mockResolvedValue({ corps: PDF, type: "application/pdf" }) };
    const antivirus = { analyser: vi.fn().mockResolvedValue(options.sain === false ? { sain: false, menace: "EICAR" } : { sain: true }) };
    const service = new AnnalesService(
      prisma as unknown as PrismaService,
      stockage as unknown as StockageService,
      antivirus as unknown as AntivirusService,
      new AccesPremiumService(prisma as unknown as PrismaService),
    );
    return { service, prisma, stockage, antivirus };
  }

  it("liste les annales, verrouille les premium sans abonnement", async () => {
    const { service } = creer();

    expect((await service.lister({ id: "e", role: "ELEVE" })).map((a) => [a.id, a.accessible, a.aUnCorrige])).toEqual([
      ["a1", true, true],
      ["a2", false, false],
    ]);
  });

  it("ajoute sujet et corrigé après analyse antivirus, sous des noms aléatoires", async () => {
    const { service, stockage, antivirus } = creer();

    const annale = await service.ajouter({ epreuve: "MATHS", annee: 2025, titre: "BFEM 2025", premium: false }, PDF, PDF);

    expect(antivirus.analyser).toHaveBeenCalledTimes(2);
    expect(stockage.ecrire.mock.calls.map((c) => c[0])).toEqual([
      expect.stringMatching(/^annales\/[0-9a-f-]{36}\.pdf$/),
      expect.stringMatching(/^annales\/[0-9a-f-]{36}\.pdf$/),
    ]);
    expect(annale).toMatchObject({ epreuve: { code: "MATHS" }, annee: 2025, aUnCorrige: true });
  });

  it("refuse un fichier qui n'est pas un PDF, un fichier infecté ou une épreuve inconnue", async () => {
    await expect(creer().service.ajouter({ epreuve: "MATHS", annee: 2025, titre: "x", premium: false }, Buffer.from("<html>"), undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const infecte = creer({ sain: false });
    await expect(infecte.service.ajouter({ epreuve: "MATHS", annee: 2025, titre: "x", premium: false }, PDF, undefined)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(infecte.stockage.ecrire).not.toHaveBeenCalled();
    await expect(creer().service.ajouter({ epreuve: "LATIN", annee: 2025, titre: "x", premium: false }, PDF, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(estUnPdf(PDF)).toBe(true);
  });

  it("télécharge une annale gratuite ; premium refusée sans abonnement", async () => {
    const { service, prisma } = creer();
    prisma.annale.findFirst.mockResolvedValue({ id: "a1", annee: 2025, premium: false, sujetCle: "annales/s.pdf", corrigeCle: null, epreuve: { code: "MATHS" } });

    expect(await service.telecharger("a1", "sujet", { id: "e", role: "ELEVE" })).toEqual({ nom: "bfem-2025-maths-sujet.pdf", corps: PDF });
    await expect(service.telecharger("a1", "corrige", { id: "e", role: "ELEVE" })).rejects.toBeInstanceOf(NotFoundException);

    prisma.annale.findFirst.mockResolvedValue({ id: "a2", annee: 2024, premium: true, sujetCle: "annales/s.pdf", corrigeCle: null, epreuve: { code: "MATHS" } });
    await expect(service.telecharger("a2", "sujet", { id: "e", role: "ELEVE" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("supprime en douceur, 404 si inconnue", async () => {
    const { service, prisma } = creer();
    await service.supprimer("a1");
    prisma.annale.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.supprimer("absente")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("SuiviBfemService", () => {
  function creer() {
    const prisma = {
      epreuveBfem: {
        findMany: vi.fn(async ({ where }: { where?: { matiere?: unknown; code?: { in: string[] } } } = {}) =>
          where?.code ? EPREUVES.filter((e) => where.code!.in.includes(e.code)) : where?.matiere ? EPREUVES.filter((e) => e.matiere) : EPREUVES,
        ),
        findUnique: vi.fn(async ({ where }: { where: { code: string } }) => EPREUVES.find((e) => e.code === where.code) ?? null),
        update: vi.fn(async ({ where, data }: { where: { code: string }; data: Record<string, unknown> }) => ({ ...EPREUVES.find((e) => e.code === where.code)!, ...data })),
      },
      estimationBfem: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), deleteMany: vi.fn() },
      copieExamen: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    return { service: new SuiviBfemService(prisma as unknown as PrismaService), prisma };
  }

  it("simulation : note du dernier examen blanc, sinon estimation de l'élève, pondérée par les coefficients", async () => {
    const { service, prisma } = creer();
    prisma.copieExamen.findMany.mockResolvedValue([
      { note: 14, examen: { epreuveId: "ep-maths" } }, // la plus récente
      { note: 8, examen: { epreuveId: "ep-maths" } },
    ]);
    prisma.estimationBfem.findMany.mockResolvedValue([
      { epreuveId: "ep-fr", note: 11 },
      { epreuveId: "ep-maths", note: 2 }, // ignorée : un examen blanc existe
    ]);

    const simulation = await service.simulation("eleve-1");

    expect(simulation.lignes.map((l) => [l.code, l.note, l.source])).toEqual([
      ["FRANCAIS", 11, "estimation"],
      ["MATHS", 14, "examen"],
      ["PC", null, null],
    ]);
    // (11×3 + 14×4) / 7 = 89 / 7 = 12,714… → 12,71
    expect(simulation).toMatchObject({ moyenne: 12.71, coefficientsPris: 7, coefficientsTotal: 9, mention: "Assez bien" });
  });

  it("enregistre ou efface les estimations", async () => {
    const { service, prisma } = creer();

    await service.enregistrerEstimations("eleve-1", { notes: { FRANCAIS: 12.5, PC: null } });

    expect(prisma.estimationBfem.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { eleveId: "eleve-1", epreuveId: "ep-fr", note: 12.5 } }));
    expect(prisma.estimationBfem.deleteMany).toHaveBeenCalledWith({ where: { eleveId: "eleve-1", epreuveId: "ep-pc" } });
    await expect(service.enregistrerEstimations("eleve-1", { notes: { LATIN: 10 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("historique : une série par épreuve d'examen blanc, du plus ancien au plus récent", async () => {
    const { service, prisma } = creer();
    prisma.copieExamen.findMany.mockResolvedValue([
      { id: "c1", note: 9.5, soumiseLe: new Date("2026-10-01T10:00:00Z"), soumissionAuto: true, examen: { titre: "n°1", epreuveId: "ep-maths" } },
      { id: "c2", note: 13, soumiseLe: new Date("2026-10-08T10:00:00Z"), soumissionAuto: false, examen: { titre: "n°1", epreuveId: "ep-maths" } },
    ]);

    const historique = await service.historique("eleve-1");

    expect(historique.epreuves.map((e) => [e.code, e.points.map((p) => p.note)])).toEqual([
      ["MATHS", [9.5, 13]],
      ["PC", []],
    ]);
  });

  it("l'admin confirme durée et coefficient : l'épreuve n'est plus « à vérifier »", async () => {
    const { service, prisma } = creer();

    expect(await service.modifierEpreuve("PC", { dureeMinutes: 90, coefficient: 2 })).toMatchObject({ dureeMinutes: 90, coefficient: 2, aVerifier: false });
    expect(prisma.epreuveBfem.update).toHaveBeenCalledWith({ where: { code: "PC" }, data: { dureeMinutes: 90, coefficient: 2, aVerifier: false } });
    await expect(service.modifierEpreuve("MATHS", { dureeMinutes: null, coefficient: 4 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.modifierEpreuve("LATIN", { dureeMinutes: 60, coefficient: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.epreuves()).map((e) => e.code)).toEqual(["FRANCAIS", "MATHS", "PC"]);
  });
});

describe("ExamensService — administration", () => {
  function creer() {
    const prisma = {
      epreuveBfem: { findUnique: vi.fn(async ({ where }: { where: { code: string } }) => EPREUVES.find((e) => e.code === where.code) ?? null) },
      examenBlanc: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({ id: "ex-1" }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "ex-1" }),
        update: vi.fn(),
      },
      questionExamen: { deleteMany: vi.fn() },
      copieExamen: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const config = { get: () => undefined } as unknown as ConfigService<Env, true>;
    return { service: new ExamensService(prisma as unknown as PrismaService, new AccesPremiumService(prisma as unknown as PrismaService), config), prisma };
  }
  const DTO = {
    titre: "Examen blanc n°3",
    epreuve: "MATHS",
    consignes: "",
    premium: true,
    publie: false,
    questions: [{ type: "VRAI_FAUX" as const, enonce: "0 est pair.", bareme: 1, explication: undefined, reponse: true }],
  };

  it("crée un examen avec un slug tiré du titre et ses questions", async () => {
    const { service, prisma } = creer();

    await service.creer(DTO);

    expect(prisma.examenBlanc.create.mock.calls[0]?.[0].data).toMatchObject({
      slug: "examen-blanc-n-3",
      epreuveId: "ep-maths",
      premium: true,
      publie: false,
      questions: { create: [expect.objectContaining({ type: "VRAI_FAUX", reponseCorrecte: true, ordre: 1 })] },
    });
  });

  it("refuse une épreuve sans examen blanc sur Xel-E", async () => {
    await expect(creer().service.creer({ ...DTO, epreuve: "FRANCAIS" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ne remplace pas les questions pendant qu'une copie est en cours", async () => {
    const { service, prisma } = creer();
    prisma.copieExamen.count.mockResolvedValue(1);

    await expect(service.modifier("ex-1", DTO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.questionExamen.deleteMany).not.toHaveBeenCalled();
  });

  it("remplace les questions sinon, et 404 pour un examen inconnu", async () => {
    const { service, prisma } = creer();

    await service.modifier("ex-1", DTO);
    expect(prisma.questionExamen.deleteMany).toHaveBeenCalledWith({ where: { examenId: "ex-1" } });

    prisma.examenBlanc.findFirst.mockResolvedValue(null);
    await expect(service.modifier("absent", DTO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("soumission automatique programmée", () => {
  it("part une seconde après la limite, jamais dans le passé", () => {
    const maintenant = new Date("2026-10-08T10:00:00Z");

    expect(delaiSoumission(new Date("2026-10-08T12:00:00Z"), maintenant)).toBe(2 * 3600_000 + MARGE_SOUMISSION_MS);
    expect(delaiSoumission(new Date("2026-10-08T09:00:00Z"), maintenant)).toBe(0);
  });
});
