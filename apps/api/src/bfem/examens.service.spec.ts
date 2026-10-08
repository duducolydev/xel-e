import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { AccesPremiumService } from "./acces-premium.service";
import { ExamensService } from "./examens.service";

const DEBUT = new Date("2026-10-08T10:00:00.000Z");
const plus = (secondes: number) => new Date(DEBUT.getTime() + secondes * 1000);

const QUESTIONS = [
  { id: "q1", examenId: "ex-1", type: "QCM", enonce: "2 + 2 ?", choix: [{ id: "a", texte: "4" }, { id: "b", texte: "5" }], reponseCorrecte: ["a"], explication: null, bareme: 2, ordre: 1 },
  { id: "q2", examenId: "ex-1", type: "VRAI_FAUX", enonce: "0 est pair.", choix: null, reponseCorrecte: true, explication: null, bareme: 1, ordre: 2 },
  { id: "q3", examenId: "ex-1", type: "REPONSE_COURTE", enonce: "6 × 7 ?", choix: null, reponseCorrecte: ["42"], explication: null, bareme: 1, ordre: 3 },
];

function examen(surcharge: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    slug: "maths-1",
    titre: "Examen blanc n°1",
    consignes: "Bon courage.",
    premium: false,
    publie: true,
    deletedAt: null,
    epreuveId: "ep-maths",
    epreuve: { id: "ep-maths", code: "MATHS", libelle: "Mathématiques", dureeMinutes: 120, aVerifier: true, matiere: "Maths" },
    questions: QUESTIONS,
    createdAt: DEBUT,
    updatedAt: DEBUT,
    ...surcharge,
  };
}

function creerService(options: { dureeTest?: number; abonne?: boolean; examen?: Record<string, unknown> } = {}) {
  const copies = new Map<string, Record<string, unknown>>();
  const ex = examen(options.examen);
  const avecExamen = (copie: Record<string, unknown> | undefined) => (copie ? { ...copie, examen: ex } : null);
  const prisma = {
    examenBlanc: { findFirst: vi.fn(async () => ex), findMany: vi.fn(async () => [{ ...ex, copies: [] }]) },
    copieExamen: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; enCoursCle?: string } }) => {
        const copie = where.id ? copies.get(where.id) : [...copies.values()].find((c) => c.enCoursCle === where.enCoursCle);
        return where.enCoursCle ? (copie ?? null) : avecExamen(copie);
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id?: string; enCoursCle?: string } }) =>
        avecExamen(where.id ? copies.get(where.id) : [...copies.values()].find((c) => c.enCoursCle === where.enCoursCle)),
      ),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const copie = { id: `copie-${copies.size + 1}`, soumiseLe: null, soumissionAuto: false, note: null, pointsObtenus: null, pointsTotal: null, correction: null, ...data };
        copies.set(copie.id, copie);
        return copie;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; soumiseLe?: null; reponses?: { equals: unknown } }; data: Record<string, unknown> }) => {
        const copie = copies.get(where.id);
        if (!copie || (where.soumiseLe === null && copie.soumiseLe)) return { count: 0 };
        if (where.reponses && JSON.stringify(where.reponses.equals) !== JSON.stringify(copie.reponses)) return { count: 0 };
        Object.assign(copie, data);
        return { count: 1 };
      }),
    },
    abonnement: { findMany: vi.fn(async () => (options.abonne ? [{ statut: "ACTIF", expireLe: null }] : [])) },
  };
  const config = { get: () => options.dureeTest } as unknown as ConfigService<Env, true>;
  const service = new ExamensService(prisma as unknown as PrismaService, new AccesPremiumService(prisma as unknown as PrismaService), config);
  const programmateur = { programmer: vi.fn() };
  service.brancherProgrammateur(programmateur);
  return { service, prisma, copies, programmateur };
}

const ELEVE = { id: "eleve-1", role: "ELEVE" };

describe("ExamensService — démarrage et minuteur serveur", () => {
  it("démarre une copie dont la limite est fixée par la durée officielle de l'épreuve", async () => {
    const { service, programmateur } = creerService();

    const etat = await service.demarrer("maths-1", ELEVE, DEBUT);

    expect(etat).toMatchObject({ terminee: false, expireLe: "2026-10-08T12:00:00.000Z", maintenant: DEBUT.toISOString() });
    expect(programmateur.programmer).toHaveBeenCalledWith("copie-1", plus(7200));
  });

  it("n'envoie jamais les bonnes réponses avec le sujet", async () => {
    const { service } = creerService();

    const etat = await service.demarrer("maths-1", ELEVE, DEBUT);

    expect(JSON.stringify(etat)).not.toMatch(/reponseCorrecte|"42"/);
    expect(etat.terminee === false && etat.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("reprend la copie en cours au lieu d'en créer une seconde", async () => {
    const { service, prisma } = creerService();
    const premiere = await service.demarrer("maths-1", ELEVE, DEBUT);

    const seconde = await service.demarrer("maths-1", ELEVE, plus(60));

    expect(prisma.copieExamen.create).toHaveBeenCalledTimes(1);
    expect(seconde.id).toBe(premiere.id);
  });

  it("utilise la durée raccourcie des tests quand elle est configurée", async () => {
    const { service } = creerService({ dureeTest: 5 });

    expect((await service.demarrer("maths-1", ELEVE, DEBUT)).terminee === false && "ok").toBe("ok");
    expect(service.dureeSecondes({ dureeMinutes: 120 })).toBe(5);
  });

  it("refuse de démarrer une épreuve sans durée définie", () => {
    const { service } = creerService();

    expect(() => service.dureeSecondes({ dureeMinutes: null })).toThrow(ConflictException);
  });

  it("garde premium : examen premium refusé sans abonnement, ouvert avec", async () => {
    await expect(creerService({ examen: { premium: true } }).service.demarrer("maths-1", ELEVE, DEBUT)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(creerService({ examen: { premium: true }, abonne: true }).service.demarrer("maths-1", ELEVE, DEBUT)).resolves.toMatchObject({
      terminee: false,
    });
  });
});

describe("ExamensService — réponses et soumission", () => {
  let ctx: ReturnType<typeof creerService>;
  let copieId: string;

  beforeEach(async () => {
    ctx = creerService({ dureeTest: 60 });
    copieId = (await ctx.service.demarrer("maths-1", ELEVE, DEBUT)).id;
  });

  it("horodate chaque réponse côté serveur", async () => {
    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(10));

    expect(ctx.copies.get(copieId)!.reponses).toEqual({ q1: { valeur: ["a"], le: plus(10).toISOString() } });
  });

  it("après la limite : réponse refusée et copie rendue automatiquement", async () => {
    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(30));

    await expect(ctx.service.repondre(copieId, "q2", true, ELEVE.id, plus(61))).rejects.toThrow(/Le temps est écoulé/);
    expect(ctx.copies.get(copieId)).toMatchObject({ soumissionAuto: true, soumiseLe: plus(60), note: 10, pointsObtenus: 2, pointsTotal: 4 });
  });

  it("soumission après expiration : seules les réponses antérieures à la limite comptent", async () => {
    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(20));
    await ctx.service.repondre(copieId, "q3", "42", ELEVE.id, plus(59));
    // Réponse glissée en base après la limite (requête en vol) : elle ne doit pas compter.
    const reponses = ctx.copies.get(copieId)!.reponses as Record<string, unknown>;
    ctx.copies.get(copieId)!.reponses = { ...reponses, q2: { valeur: true, le: plus(61).toISOString() } };

    const resultat = await ctx.service.finaliser(copieId, plus(65));

    expect(resultat).toMatchObject({ soumissionAuto: true, pointsObtenus: 3, pointsTotal: 4, note: 15 });
    expect(resultat.details.find((d) => d.questionId === "q2")?.statut).toBe("sans-reponse");
  });

  it("rendre sa copie avant la fin : soumission manuelle, note sur 20", async () => {
    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(5));
    await ctx.service.repondre(copieId, "q2", true, ELEVE.id, plus(6));
    await ctx.service.repondre(copieId, "q3", "42", ELEVE.id, plus(7));

    const resultat = await ctx.service.soumettre(copieId, ELEVE.id, plus(8));

    expect(resultat).toMatchObject({ note: 20, soumissionAuto: false, soumiseLe: plus(8).toISOString() });
    await expect(ctx.service.repondre(copieId, "q1", ["b"], ELEVE.id, plus(9))).rejects.toThrow(/déjà été rendue/);
  });

  it("la finalisation est idempotente (soumission programmée et manuelle simultanées)", async () => {
    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(5));
    const premiere = await ctx.service.soumettre(copieId, ELEVE.id, plus(10));

    const seconde = await ctx.service.finaliser(copieId, plus(70));

    expect(seconde).toEqual(premiere);
    expect(ctx.prisma.copieExamen.updateMany.mock.calls.filter((c) => "note" in c[0].data)).toHaveLength(1);
  });

  it("lire une copie expirée la rend automatiquement (filet si la file est en panne)", async () => {
    const etat = await ctx.service.etat(copieId, ELEVE.id, plus(120));

    expect(etat).toMatchObject({ terminee: true, soumissionAuto: true, note: 0 });
  });

  it("refuse une question étrangère à l'examen", async () => {
    await expect(ctx.service.repondre(copieId, "autre", true, ELEVE.id, plus(1))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("la copie d'un autre élève est introuvable (404)", async () => {
    await expect(ctx.service.etat(copieId, "eleve-2", plus(1))).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctx.service.repondre(copieId, "q1", ["a"], "eleve-2", plus(1))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deux onglets : la réponse est réessayée si la copie a changé entre-temps", async () => {
    ctx.prisma.copieExamen.updateMany.mockImplementationOnce(async () => ({ count: 0 }));

    await ctx.service.repondre(copieId, "q1", ["a"], ELEVE.id, plus(3));

    expect(ctx.copies.get(copieId)!.reponses).toHaveProperty("q1");
  });

  it("le résultat n'existe qu'une fois la copie rendue", async () => {
    await expect(ctx.service.resultat(copieId, ELEVE.id)).rejects.toBeInstanceOf(NotFoundException);
    await ctx.service.soumettre(copieId, ELEVE.id, plus(2));
    await expect(ctx.service.resultat(copieId, ELEVE.id)).resolves.toMatchObject({ note: 0 });
  });
});

describe("ExamensService — liste et concurrence au démarrage", () => {
  it("liste les examens publiés avec leur accès et la dernière note", async () => {
    const { service, prisma } = creerService({ examen: { premium: true } });
    prisma.examenBlanc.findMany.mockResolvedValue([
      {
        ...examen({ premium: true }),
        copies: [
          { id: "c2", note: null, soumiseLe: null },
          { id: "c1", note: 14.5, soumiseLe: DEBUT },
        ],
      },
    ] as never);

    const [resume] = await service.lister(ELEVE);

    expect(resume).toMatchObject({ slug: "maths-1", premium: true, accessible: false, dureeMinutes: 120, nombreQuestions: 3, pointsTotal: 4, derniereNote: 14.5, copieEnCours: "c2" });
  });

  it("deux onglets démarrent en même temps : une seule copie (unicité)", async () => {
    const { service, prisma, copies } = creerService();
    copies.set("copie-x", { id: "copie-x", enCoursCle: "eleve-1:ex-1", soumiseLe: null, expireLe: plus(7200), demarreLe: DEBUT, reponses: {}, eleveId: "eleve-1" });
    prisma.copieExamen.findUnique.mockResolvedValueOnce(null);
    prisma.copieExamen.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" }));

    expect((await service.demarrer("maths-1", ELEVE, DEBUT)).id).toBe("copie-x");
  });

  it("404 pour un examen non publié", async () => {
    const { service, prisma } = creerService();
    prisma.examenBlanc.findFirst.mockResolvedValue(null as never);

    await expect(service.detail("brouillon", ELEVE)).rejects.toBeInstanceOf(NotFoundException);
  });
});
