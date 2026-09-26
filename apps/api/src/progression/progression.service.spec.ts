import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ProgressionService } from "./progression.service";
import { BADGES } from "./regles";

const conflit = () => new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "5" });

interface Progression {
  utilisateurId: string;
  leconId: string;
  termineLe: Date | null;
  quizReussiLe: Date | null;
  meilleurScore: number | null;
}

function creerFausseBase() {
  const user = { id: "eleve-1", serieJours: 0, serieRecord: 0, dernierJourActif: null as string | null };
  const progressions: Progression[] = [];
  const gains: { utilisateurId: string; source: string; cle: string; xp: number }[] = [];
  const badgesObtenus: { utilisateurId: string; badgeId: string }[] = [];
  const notifications: { contenu: string }[] = [];
  const badges = BADGES.map((b) => ({ id: `badge-${b.code}`, code: b.code, libelle: b.libelle, description: b.description }));
  const trouver = (w: { utilisateurId_leconId: { utilisateurId: string; leconId: string } }) =>
    progressions.find((p) => p.utilisateurId === w.utilisateurId_leconId.utilisateurId && p.leconId === w.utilisateurId_leconId.leconId);

  const prisma = {
    lecon: { findFirst: async () => ({ id: "lecon-1" }) },
    quiz: { findUniqueOrThrow: async () => ({ leconId: "lecon-1" }) },
    chapitre: { findMany: async () => [] },
    badge: {
      upsert: async ({ where, create }: { where: { code: string }; create: { code: string; libelle: string; description: string } }) => {
        const existant = badges.find((b) => b.code === where.code);
        if (existant) return existant;
        const nouveau = { id: `badge-${create.code}`, ...create };
        badges.push(nouveau);
        return nouveau;
      },
    },
    user: {
      findUniqueOrThrow: async () => ({ ...user }),
      updateMany: async ({ where, data }: { where: { dernierJourActif: string | null }; data: typeof user }) => {
        if (user.dernierJourActif !== where.dernierJourActif) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
    },
    progression: {
      findUnique: async ({ where }: { where: Parameters<typeof trouver>[0] }) => trouver(where) ?? null,
      upsert: async ({ where, update, create }: { where: Parameters<typeof trouver>[0]; update: Partial<Progression>; create: Pick<Progression, "utilisateurId" | "leconId"> & Partial<Progression> }) => {
        const existante = trouver(where);
        if (existante) return Object.assign(existante, update);
        const nouvelle = { termineLe: null, quizReussiLe: null, meilleurScore: null, ...create };
        progressions.push(nouvelle);
        return nouvelle;
      },
      count: async ({ where }: { where: { termineLe?: unknown; quizReussiLe?: unknown } }) =>
        progressions.filter((p) => ("termineLe" in where ? p.termineLe : p.quizReussiLe)).length,
      findMany: async () => progressions.map(() => ({ lecon: { chapitreId: "chapitre-1" } })),
    },
    gainXp: {
      create: async ({ data }: { data: (typeof gains)[number] }) => {
        if (gains.some((g) => g.utilisateurId === data.utilisateurId && g.source === data.source && g.cle === data.cle)) {
          throw conflit();
        }
        gains.push(data);
        return data;
      },
      count: async ({ where }: { where: { source: string } }) => gains.filter((g) => g.source === where.source).length,
    },
    badgeUtilisateur: {
      findMany: async () =>
        badgesObtenus.map((b) => ({ badge: { code: badges.find((x) => x.id === b.badgeId)!.code } })),
      create: async ({ data }: { data: (typeof badgesObtenus)[number] }) => {
        if (badgesObtenus.some((b) => b.badgeId === data.badgeId)) throw conflit();
        badgesObtenus.push(data);
        return data;
      },
    },
    notification: {
      create: async ({ data }: { data: { contenu: string } }) => {
        notifications.push(data);
        return data;
      },
    },
  };
  return { prisma, user, progressions, gains, badgesObtenus, notifications, badges };
}

const LUNDI = new Date("2026-09-21T10:00:00Z");
const MARDI = new Date("2026-09-22T10:00:00Z");

describe("ProgressionService", () => {
  let base: ReturnType<typeof creerFausseBase>;
  let service: ProgressionService;

  beforeEach(() => {
    base = creerFausseBase();
    service = new ProgressionService(base.prisma as unknown as PrismaService);
  });

  describe("leçon terminée", () => {
    it("rapporte 10 XP, le badge « Première leçon » et sa notification", async () => {
      const resultat = await service.terminerLecon("pythagore", "eleve-1", LUNDI);

      expect(resultat).toMatchObject({ dejaTerminee: false, xp: 10 });
      expect(resultat.badges.map((b) => b.code)).toEqual(["premiere-lecon"]);
      expect(base.notifications).toEqual([expect.objectContaining({ contenu: expect.stringContaining("Première leçon") })]);
      expect(base.user).toMatchObject({ serieJours: 1, dernierJourActif: "2026-09-21" });
    });

    it("est idempotente : la terminer à nouveau ne rapporte rien et ne double aucun badge", async () => {
      await service.terminerLecon("pythagore", "eleve-1", LUNDI);

      const encore = await service.terminerLecon("pythagore", "eleve-1", MARDI);

      expect(encore).toEqual({ dejaTerminee: true, xp: 0, badges: [] });
      expect(base.gains).toHaveLength(1);
      expect(base.badgesObtenus).toHaveLength(1);
      expect(base.notifications).toHaveLength(1);
      expect(base.user.serieJours).toBe(1);
    });
  });

  describe("quiz soumis", () => {
    it("quiz raté : aucune XP, mais le jour compte pour la série et le score est retenu", async () => {
      const gains = await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 40, LUNDI);

      expect(gains).toEqual({ xp: 0, badges: [] });
      expect(base.user.dernierJourActif).toBe("2026-09-21");
      expect(base.progressions[0]).toMatchObject({ meilleurScore: 40, quizReussiLe: null });
    });

    it("première réussite : +20 XP et le badge « Premier quiz réussi »", async () => {
      const gains = await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 80, LUNDI);

      expect(gains.xp).toBe(20);
      expect(gains.badges.map((b) => b.code)).toEqual(["premier-quiz-reussi"]);
    });

    it("100 % : +20 XP de réussite et +10 XP de bonus, badge « Sans faute »", async () => {
      const gains = await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 100, LUNDI);

      expect(gains.xp).toBe(30);
      expect(gains.badges.map((b) => b.code).sort()).toEqual(["premier-quiz-reussi", "sans-faute"]);
    });

    it("refaire un quiz déjà réussi ne rapporte plus d'XP (pas d'accumulation)", async () => {
      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 80, LUNDI);
      const seconde = await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 80, MARDI);

      expect(seconde).toEqual({ xp: 0, badges: [] });
    });

    it("réussir mieux ensuite ne rapporte que le bonus de 100 % manquant", async () => {
      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 80, LUNDI);
      const parfait = await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 100, MARDI);

      expect(parfait.xp).toBe(10);
      expect(base.progressions[0]?.meilleurScore).toBe(100);
    });

    it("le meilleur score ne redescend pas après une tentative moins bonne", async () => {
      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 90, LUNDI);
      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 30, MARDI);

      expect(base.progressions[0]?.meilleurScore).toBe(90);
    });
  });

  describe("série", () => {
    it("deux activités le même jour ⇒ la série n'augmente qu'une fois ; le lendemain ⇒ +1", async () => {
      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 40, LUNDI);
      await service.terminerLecon("pythagore", "eleve-1", LUNDI);
      expect(base.user.serieJours).toBe(1);

      await service.enregistrerQuizSoumis("eleve-1", "quiz-1", 40, MARDI);
      expect(base.user.serieJours).toBe(2);
    });
  });

  it("attribue un badge même si la table des badges a été vidée depuis le démarrage", async () => {
    base.badges.length = 0;

    const resultat = await service.terminerLecon("pythagore", "eleve-1", LUNDI);

    expect(resultat.badges.map((b) => b.code)).toEqual(["premiere-lecon"]);
    expect(base.badges.map((b) => b.code)).toEqual(["premiere-lecon"]);
  });

  it("un badge attribué au même instant par un autre événement n'est ni doublé ni notifié deux fois", async () => {
    const creation = base.prisma.badgeUtilisateur.create;
    base.prisma.badgeUtilisateur.create = async (args) => {
      await creation(args);
      throw conflit();
    };

    const resultat = await service.terminerLecon("pythagore", "eleve-1", LUNDI);

    expect(resultat.badges).toEqual([]);
    expect(base.notifications).toHaveLength(0);
    expect(base.badgesObtenus).toHaveLength(1);
  });
});
