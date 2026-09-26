import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ProgressionService } from "./progression.service";

const SAMEDI = new Date("2026-09-26T15:00:00Z");

function lecon(terminee: boolean, quizReussi: boolean, avecQuiz = true) {
  return {
    quiz: avecQuiz ? { deletedAt: null, _count: { questions: 3 } } : null,
    progressions: terminee || quizReussi ? [{ termineLe: terminee ? SAMEDI : null, quizReussiLe: quizReussi ? SAMEDI : null }] : [],
  };
}

function creerService(surcharges: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        serieJours: 4,
        serieRecord: 6,
        dernierJourActif: "2026-09-25",
        niveauId: "niveau-3e",
        niveau: { libelle: "3e" },
        role: "ELEVE",
        classementActif: true,
        pseudonyme: "fatou_demo",
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
    },
    gainXp: {
      aggregate: vi.fn().mockResolvedValueOnce({ _sum: { xp: 70 } }).mockResolvedValueOnce({ _sum: { xp: 30 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    badgeUtilisateur: {
      findMany: vi.fn().mockResolvedValue([{ obtenuLe: SAMEDI, badge: { code: "premiere-lecon" } }]),
    },
    progression: {
      findMany: vi.fn().mockResolvedValue([
        { termineLe: new Date("2026-09-25T10:00:00Z"), lecon: { slug: "l1", versionPubliee: { titre: "Leçon 1" } } },
      ]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    tentative: {
      findMany: vi.fn().mockResolvedValue([
        { termineLe: SAMEDI, score: 80, quiz: { lecon: { slug: "l1", versionPubliee: { titre: "Leçon 1" } } } },
      ]),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([{ id: "n1", contenu: "Nouveau badge", lu: false, createdAt: SAMEDI }]),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    chapitre: {
      findMany: vi.fn().mockResolvedValue([
        { titre: "Chapitre 1", matiere: { libelle: "Maths" }, lecons: [lecon(true, true), lecon(true, false)] },
        { titre: "Chapitre 2", matiere: { libelle: "Maths" }, lecons: [lecon(false, false, false)] },
        { titre: "Vide", matiere: { libelle: "PC" }, lecons: [] },
      ]),
    },
    lecon: { findFirst: vi.fn().mockResolvedValue({ id: "lecon-1" }) },
    ...surcharges,
  };
  return { service: new ProgressionService(prisma as unknown as PrismaService), prisma };
}

describe("tableau de bord", () => {
  it("rassemble XP, série, avancement par matière, badges, activités et notifications", async () => {
    const { service } = creerService();

    const tableau = await service.tableauDeBord("eleve-1", SAMEDI);

    expect(tableau).toMatchObject({
      niveau: "3e",
      xpTotal: 70,
      xpSemaine: 30,
      serie: { actuelle: 4, record: 6 },
      notificationsNonLues: 1,
    });
    const maths = tableau.matieres.find((m) => m.slug === "maths");
    expect(maths).toEqual({
      slug: "maths",
      nom: "Mathématiques",
      pourcentage: 60,
      chapitres: [
        { titre: "Chapitre 1", pourcentage: 75, complet: false, leconsTerminees: 2, leconsTotal: 2 },
        { titre: "Chapitre 2", pourcentage: 0, complet: false, leconsTerminees: 0, leconsTotal: 1 },
      ],
    });
    expect(tableau.matieres.find((m) => m.slug === "pc")?.chapitres).toEqual([]);
    expect(tableau.badges.find((b) => b.code === "premiere-lecon")?.obtenuLe).toBe(SAMEDI.toISOString());
    expect(tableau.badges.find((b) => b.code === "sans-faute")?.obtenuLe).toBeNull();
    expect(tableau.activites.map((a) => [a.type, a.score])).toEqual([
      ["quiz", 80],
      ["lecon", null],
    ]);
  });

  it("affiche une série à 0 quand l'élève a manqué un jour", async () => {
    const { service, prisma } = creerService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      serieJours: 4,
      serieRecord: 6,
      dernierJourActif: "2026-09-20",
      niveauId: null,
      niveau: null,
    });

    const tableau = await service.tableauDeBord("eleve-1", SAMEDI);

    expect(tableau.serie).toEqual({ actuelle: 0, record: 6 });
    expect(tableau.matieres).toEqual([]);
  });

  it("vaut zéro sans aucun gain", async () => {
    const { service, prisma } = creerService();
    prisma.gainXp.aggregate = vi.fn().mockResolvedValue({ _sum: { xp: null } });

    const tableau = await service.tableauDeBord("eleve-1", SAMEDI);

    expect(tableau).toMatchObject({ xpTotal: 0, xpSemaine: 0 });
  });
});

describe("état d'une leçon et notifications", () => {
  it("indique une leçon pas encore commencée", async () => {
    const { service } = creerService();
    await expect(service.etatLecon("l1", "eleve-1")).resolves.toEqual({
      terminee: false,
      quizReussi: false,
      meilleurScore: null,
    });
  });

  it("renvoie 404 pour une leçon non publiée", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findFirst.mockResolvedValue(null);
    await expect(service.etatLecon("brouillon", "eleve-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marque les notifications non lues de l'élève comme lues", async () => {
    const { service, prisma } = creerService();

    await service.marquerNotificationsLues("eleve-1");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { utilisateurId: "eleve-1", lu: false },
      data: { lu: true },
    });
  });
});

describe("classement", () => {
  it("classe les participants du niveau sur l'XP de la semaine en cours", async () => {
    const { service, prisma } = creerService();
    prisma.user.findMany.mockResolvedValue([
      { id: "eleve-1", pseudonyme: "fatou_demo" },
      { id: "eleve-2", pseudonyme: "baobab_42" },
      { id: "eleve-3", pseudonyme: "lion" },
    ]);
    prisma.gainXp.groupBy.mockResolvedValue([
      { utilisateurId: "eleve-2", _sum: { xp: 50 } },
      { utilisateurId: "eleve-1", _sum: { xp: 30 } },
    ]);

    const classement = await service.classement("eleve-1", SAMEDI);

    expect(classement).toMatchObject({ niveau: "3e", debutSemaine: "2026-09-21T00:00:00.000Z", participe: true });
    expect(classement.lignes).toEqual([
      { rang: 1, pseudonyme: "baobab_42", xp: 50, estMoi: false },
      { rang: 2, pseudonyme: "fatou_demo", xp: 30, estMoi: true },
      { rang: 3, pseudonyme: "lion", xp: 0, estMoi: false },
    ]);
    expect(prisma.user.findMany.mock.calls[0]?.[0].where).toMatchObject({ classementActif: true, niveauId: "niveau-3e" });
    expect(prisma.gainXp.groupBy.mock.calls[0]?.[0].where.gagneLe).toEqual({ gte: new Date("2026-09-21T00:00:00Z") });
  });

  it("est vide pour un compte sans niveau", async () => {
    const { service, prisma } = creerService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ niveauId: null, niveau: null, classementActif: false, pseudonyme: null });

    await expect(service.classement("parent-1", SAMEDI)).resolves.toMatchObject({ lignes: [], monRang: null });
  });

  it("active la participation avec le pseudonyme choisi, ou la retire", async () => {
    const { service, prisma } = creerService();

    await service.reglerClassement("eleve-1", { actif: true, pseudonyme: "fatou_demo" });
    await service.reglerClassement("eleve-1", { actif: false });

    expect(prisma.user.update.mock.calls.map((c) => c[0].data)).toEqual([
      { classementActif: true, pseudonyme: "fatou_demo" },
      { classementActif: false },
    ]);
  });

  it("refuse un pseudonyme déjà pris (409)", async () => {
    const { service, prisma } = creerService();
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "5" }),
    );

    await expect(service.reglerClassement("eleve-1", { actif: true, pseudonyme: "pris" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("réserve le classement aux élèves", async () => {
    const { service, prisma } = creerService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ role: "PARENT" });

    await expect(service.reglerClassement("parent-1", { actif: true, pseudonyme: "papa" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
