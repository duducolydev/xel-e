import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PublicationService } from "../contenus/publication.service";
import type { Acteur } from "../contenus/workflow";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SEUIL_QUIZ_REUSSI } from "../progression/regles";
import { StudioService } from "./studio.service";

const PROF: Acteur = { id: "prof-1", role: "PROFESSEUR" };
const QUESTION_ID = "0b6c4b1e-4a5e-4f7d-9d51-1f6f4e8e2a01";

function leconBrute(surcharge: Record<string, unknown> = {}) {
  return {
    id: "lecon-1",
    slug: "pythagore",
    titre: "Pythagore",
    contenu: "## Énoncé",
    statut: "BROUILLON",
    version: 0,
    auteurId: PROF.id,
    quizBrouillon: null,
    soumisLe: null,
    chapitre: { titre: "Géométrie", niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
    ...surcharge,
  };
}

function creerService() {
  const prisma = {
    chapitre: { findMany: vi.fn().mockResolvedValue([]) },
    lecon: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockResolvedValue({ nomComplet: "Awa Ndiaye" }) },
    commentaireRevue: { findMany: vi.fn().mockResolvedValue([]) },
    quiz: { findFirst: vi.fn().mockResolvedValue(null) },
    tentative: { groupBy: vi.fn().mockResolvedValue([]) },
  };
  const publication = {
    lecon: vi.fn().mockResolvedValue(leconBrute()),
    creerLecon: vi.fn().mockResolvedValue({ id: "lecon-1" }),
    modifierLecon: vi.fn(),
    soumettre: vi.fn(),
  };
  const notifications = { recentes: vi.fn().mockResolvedValue({ notifications: [], nonLues: 0 }) };
  const service = new StudioService(
    prisma as unknown as PrismaService,
    publication as unknown as PublicationService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, publication, notifications };
}

describe("StudioService — leçons", () => {
  it("liste les chapitres existants avec niveau et nom de matière", async () => {
    const { service, prisma } = creerService();
    prisma.chapitre.findMany.mockResolvedValue([
      { id: "c1", titre: "Géométrie", niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
    ]);

    expect(await service.chapitres()).toEqual([{ id: "c1", titre: "Géométrie", niveau: "4e", matiere: "Mathématiques" }]);
    expect(prisma.chapitre.findMany.mock.calls[0]?.[0].where).toEqual({ deletedAt: null });
  });

  it("ne liste que les leçons de l'auteur, avec le dernier refus tant qu'elles sont en brouillon", async () => {
    const { service, prisma } = creerService();
    const commun = {
      ...leconBrute(),
      updatedAt: new Date("2026-09-20T10:00:00Z"),
      auteur: { nomComplet: "Awa Ndiaye" },
      commentaires: [{ contenu: "Ajoute un schéma." }],
    };
    prisma.lecon.findMany.mockResolvedValue([commun, { ...commun, id: "lecon-2", statut: "EN_REVUE", soumisLe: new Date("2026-09-21T10:00:00Z") }]);

    const lecons = await service.mesLecons(PROF);

    expect(prisma.lecon.findMany.mock.calls[0]?.[0].where).toEqual({ auteurId: PROF.id, deletedAt: null });
    expect(lecons[0]).toMatchObject({ statut: "BROUILLON", dernierCommentaire: "Ajoute un schéma.", matiere: "Mathématiques", auteur: "Awa Ndiaye" });
    expect(lecons[1]).toMatchObject({ statut: "EN_REVUE", dernierCommentaire: null, soumisLe: "2026-09-21T10:00:00.000Z" });
  });

  it("la file de revue ne contient que les leçons EN_REVUE, plus ancienne soumission d'abord", async () => {
    const { service, prisma } = creerService();

    await service.fileDeRevue();

    expect(prisma.lecon.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { statut: "EN_REVUE", deletedAt: null },
      orderBy: { soumisLe: "asc" },
    });
  });

  it("vérifie l'accès via PublicationService (404 pour la leçon d'un autre)", async () => {
    const { service, publication } = creerService();
    publication.lecon.mockRejectedValue(new NotFoundException());

    await expect(service.lecon("lecon-1", { id: "prof-2", role: "PROFESSEUR" })).rejects.toBeInstanceOf(NotFoundException);
    expect(publication.lecon).toHaveBeenCalledWith("lecon-1", { id: "prof-2", role: "PROFESSEUR" });
  });

  it("présente le quiz en ligne quand aucune modification n'est en cours", async () => {
    const { service, prisma } = creerService();
    prisma.quiz.findFirst.mockResolvedValue({
      questions: [{ id: QUESTION_ID, type: "VRAI_FAUX", enonce: "0 est pair.", choix: null, reponseCorrecte: true, explication: null, bareme: 1 }],
    });
    prisma.commentaireRevue.findMany.mockResolvedValue([
      { contenu: "Trop court.", createdAt: new Date("2026-09-22T08:00:00Z"), auteur: { nomComplet: "Admin" } },
    ]);

    const lecon = await service.lecon("lecon-1", PROF);

    expect(lecon).toMatchObject({
      auteur: "Awa Ndiaye",
      niveau: "4e",
      modifiable: true,
      modificationsQuizEnCours: false,
      quiz: [{ id: QUESTION_ID, type: "VRAI_FAUX", reponse: true }],
      commentaires: [{ auteur: "Admin", contenu: "Trop court.", createdAt: "2026-09-22T08:00:00.000Z" }],
    });
  });

  it("présente le quiz brouillon quand il existe, et verrouille une leçon en revue", async () => {
    const { service, prisma, publication } = creerService();
    const brouillon = [{ type: "VRAI_FAUX", enonce: "1 est pair.", bareme: 1, reponse: false }];
    publication.lecon.mockResolvedValue(leconBrute({ statut: "EN_REVUE", quizBrouillon: brouillon, auteurId: null }));

    const lecon = await service.lecon("lecon-1", PROF);

    expect(prisma.quiz.findFirst).not.toHaveBeenCalled();
    expect(lecon).toMatchObject({ modifiable: false, modificationsQuizEnCours: true, auteur: null, quiz: [{ enonce: "1 est pair." }] });
  });

  it("crée, modifie et soumet via le circuit de publication", async () => {
    const { service, publication } = creerService();

    await service.creer({ chapitreId: "c1", titre: "Thalès" }, PROF);
    await service.modifier("lecon-1", { contenu: "## Texte" }, PROF);
    await service.soumettre("lecon-1", PROF);

    expect(publication.creerLecon).toHaveBeenCalledWith({ chapitreId: "c1", titre: "Thalès" }, PROF.id);
    expect(publication.modifierLecon).toHaveBeenCalledWith("lecon-1", { contenu: "## Texte" }, PROF);
    expect(publication.soumettre).toHaveBeenCalledWith("lecon-1", PROF);
  });
});

describe("StudioService — statistiques", () => {
  it("agrège vues et tentatives d'élèves des leçons en ligne de l'auteur", async () => {
    const { service, prisma } = creerService();
    prisma.lecon.findMany.mockResolvedValue([
      { slug: "pythagore", vues: 40, versionPubliee: { titre: "Pythagore" }, quiz: { id: "quiz-1" } },
      { slug: "thales", vues: 10, versionPubliee: { titre: "Thalès" }, quiz: null },
    ]);
    prisma.tentative.groupBy
      .mockResolvedValueOnce([{ quizId: "quiz-1", _count: { _all: 4 }, _sum: { score: 300 } }])
      .mockResolvedValueOnce([{ quizId: "quiz-1", _count: { _all: 3 } }]);

    const stats = await service.statistiques(PROF.id);

    expect(prisma.lecon.findMany.mock.calls[0]?.[0].where).toMatchObject({ auteurId: PROF.id, versionPublieeId: { not: null } });
    expect(prisma.tentative.groupBy.mock.calls[0]?.[0].where).toMatchObject({ termineLe: { not: null }, utilisateur: { role: "ELEVE" } });
    expect(prisma.tentative.groupBy.mock.calls[1]?.[0].where).toMatchObject({ score: { gte: SEUIL_QUIZ_REUSSI } });
    expect(stats.lecons).toEqual([
      { slug: "pythagore", titre: "Pythagore", vues: 40, tentatives: 4, tauxReussite: 75, scoreMoyen: 75 },
      { slug: "thales", titre: "Thalès", vues: 10, tentatives: 0, tauxReussite: null, scoreMoyen: null },
    ]);
    expect(stats.total).toEqual({ vues: 50, tentatives: 4, tauxReussite: 75, scoreMoyen: 75 });
  });

  it("sans quiz, ne lance aucune agrégation de tentatives", async () => {
    const { service, prisma } = creerService();

    const tableau = await service.tableau(PROF);

    expect(prisma.tentative.groupBy).not.toHaveBeenCalled();
    expect(tableau).toEqual({
      lecons: [],
      statistiques: { lecons: [], total: { vues: 0, tentatives: 0, tauxReussite: null, scoreMoyen: null } },
      notifications: [],
      notificationsNonLues: 0,
    });
  });
});
