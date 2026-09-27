import { Injectable } from "@nestjs/common";
import type { Prisma, StatutLecon } from "@prisma/client";
import {
  INFOS_MATIERES,
  quizBrouillonSchema,
  type ChapitreStudio,
  type CreerLeconStudioDto,
  type LeconStudio,
  type Matiere,
  type ModifierLeconStudioDto,
  type Niveau,
  type QuizBrouillon,
  type ResumeLeconStudio,
  type StatistiquesProfesseur,
  type TableauStudio,
} from "@xel-e/shared";
import { PublicationService } from "../contenus/publication.service";
import { FILTRE_LECONS_PUBLIQUES, type Acteur } from "../contenus/workflow";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SEUIL_QUIZ_REUSSI } from "../progression/regles";
import { versBrouillon } from "./quiz-brouillon";
import { agregerStatistiques } from "./statistiques";

const SELECTION_RESUME = {
  id: true,
  slug: true,
  titre: true,
  statut: true,
  version: true,
  soumisLe: true,
  updatedAt: true,
  auteur: { select: { nomComplet: true } },
  chapitre: { select: { titre: true, niveau: { select: { libelle: true } }, matiere: { select: { libelle: true } } } },
  commentaires: { orderBy: { createdAt: "desc" }, take: 1, select: { contenu: true } },
} satisfies Prisma.LeconSelect;

type LeconResumeBrute = Prisma.LeconGetPayload<{ select: typeof SELECTION_RESUME }>;

const nomMatiere = (libelle: string) => INFOS_MATIERES[libelle as Matiere]?.nom ?? libelle;

function versResume(lecon: LeconResumeBrute): ResumeLeconStudio {
  return {
    id: lecon.id,
    slug: lecon.slug,
    titre: lecon.titre,
    statut: lecon.statut,
    version: lecon.version,
    niveau: lecon.chapitre.niveau.libelle as Niveau,
    matiere: nomMatiere(lecon.chapitre.matiere.libelle),
    chapitre: lecon.chapitre.titre,
    auteur: lecon.auteur?.nomComplet ?? null,
    soumisLe: lecon.soumisLe?.toISOString() ?? null,
    majLe: lecon.updatedAt.toISOString(),
    // Le dernier refus n'est pertinent que tant que la leçon n'a pas été resoumise.
    dernierCommentaire: lecon.statut === "BROUILLON" ? (lecon.commentaires[0]?.contenu ?? null) : null,
  };
}

// Espace professeur : lecture de ses leçons, de leur quiz et de leurs statistiques.
// Toutes les écritures passent par PublicationService (machine à états + droits).
@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: PublicationService,
    private readonly notifications: NotificationsService,
  ) {}

  async chapitres(): Promise<ChapitreStudio[]> {
    const chapitres = await this.prisma.chapitre.findMany({
      where: { deletedAt: null },
      orderBy: [{ niveau: { ordre: "asc" } }, { matiere: { libelle: "asc" } }, { ordre: "asc" }],
      select: { id: true, titre: true, niveau: { select: { libelle: true } }, matiere: { select: { libelle: true } } },
    });
    return chapitres.map((c) => ({
      id: c.id,
      titre: c.titre,
      niveau: c.niveau.libelle as Niveau,
      matiere: nomMatiere(c.matiere.libelle),
    }));
  }

  async mesLecons(acteur: Acteur): Promise<ResumeLeconStudio[]> {
    const lecons = await this.prisma.lecon.findMany({
      where: { auteurId: acteur.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: SELECTION_RESUME,
    });
    return lecons.map(versResume);
  }

  // File de revue de l'administration : la plus ancienne soumission d'abord.
  async fileDeRevue(): Promise<ResumeLeconStudio[]> {
    const lecons = await this.prisma.lecon.findMany({
      where: { statut: "EN_REVUE", deletedAt: null, chapitre: { deletedAt: null } },
      orderBy: { soumisLe: "asc" },
      select: SELECTION_RESUME,
    });
    return lecons.map(versResume);
  }

  private async quizDeTravail(leconId: string, brouillon: Prisma.JsonValue): Promise<QuizBrouillon> {
    if (brouillon !== null) {
      const lu = quizBrouillonSchema.safeParse(brouillon);
      return lu.success ? lu.data : (brouillon as unknown as QuizBrouillon);
    }
    const quiz = await this.prisma.quiz.findFirst({
      where: { leconId, deletedAt: null },
      include: { questions: { orderBy: { ordre: "asc" } } },
    });
    return quiz ? versBrouillon(quiz.questions) : [];
  }

  async lecon(id: string, acteur: Acteur): Promise<LeconStudio> {
    const lecon = await this.publication.lecon(id, acteur);
    const [auteur, commentaires, quiz] = await Promise.all([
      lecon.auteurId ? this.prisma.user.findUnique({ where: { id: lecon.auteurId }, select: { nomComplet: true } }) : null,
      this.prisma.commentaireRevue.findMany({
        where: { leconId: id },
        orderBy: { createdAt: "desc" },
        select: { contenu: true, createdAt: true, auteur: { select: { nomComplet: true } } },
      }),
      this.quizDeTravail(id, lecon.quizBrouillon),
    ]);
    const statut: StatutLecon = lecon.statut;
    return {
      id: lecon.id,
      slug: lecon.slug,
      titre: lecon.titre,
      contenu: lecon.contenu ?? "",
      statut,
      version: lecon.version,
      auteur: auteur?.nomComplet ?? null,
      niveau: lecon.chapitre.niveau.libelle as Niveau,
      matiere: nomMatiere(lecon.chapitre.matiere.libelle),
      chapitre: lecon.chapitre.titre,
      quiz,
      modificationsQuizEnCours: lecon.quizBrouillon !== null,
      commentaires: commentaires.map((c) => ({
        auteur: c.auteur.nomComplet,
        contenu: c.contenu,
        createdAt: c.createdAt.toISOString(),
      })),
      soumisLe: lecon.soumisLe?.toISOString() ?? null,
      modifiable: statut !== "EN_REVUE",
    };
  }

  async creer(dto: CreerLeconStudioDto, acteur: Acteur): Promise<LeconStudio> {
    const lecon = await this.publication.creerLecon(dto, acteur.id);
    return this.lecon(lecon.id, acteur);
  }

  async modifier(id: string, dto: ModifierLeconStudioDto, acteur: Acteur): Promise<LeconStudio> {
    await this.publication.modifierLecon(id, dto, acteur);
    return this.lecon(id, acteur);
  }

  async soumettre(id: string, acteur: Acteur): Promise<LeconStudio> {
    await this.publication.soumettre(id, acteur);
    return this.lecon(id, acteur);
  }

  // Statistiques des leçons en ligne de l'auteur : vues et tentatives d'élèves sur leur quiz.
  async statistiques(auteurId: string): Promise<StatistiquesProfesseur> {
    const lecons = await this.prisma.lecon.findMany({
      where: { auteurId, ...FILTRE_LECONS_PUBLIQUES },
      select: { slug: true, vues: true, versionPubliee: { select: { titre: true } }, quiz: { select: { id: true } } },
    });
    const quizIds = lecons.flatMap((l) => (l.quiz ? [l.quiz.id] : []));
    const filtre = { quizId: { in: quizIds }, termineLe: { not: null }, utilisateur: { role: "ELEVE" } } satisfies Prisma.TentativeWhereInput;
    const [toutes, reussies] =
      quizIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.tentative.groupBy({ by: ["quizId"], where: filtre, _count: { _all: true }, _sum: { score: true } }),
            this.prisma.tentative.groupBy({
              by: ["quizId"],
              where: { ...filtre, score: { gte: SEUIL_QUIZ_REUSSI } },
              _count: { _all: true },
            }),
          ]);
    return agregerStatistiques(
      lecons.map((lecon) => {
        const quizId = lecon.quiz?.id;
        const ligne = toutes.find((t) => t.quizId === quizId);
        return {
          slug: lecon.slug,
          titre: lecon.versionPubliee?.titre ?? "",
          vues: lecon.vues,
          tentatives: ligne?._count._all ?? 0,
          reussies: reussies.find((r) => r.quizId === quizId)?._count._all ?? 0,
          sommeScores: ligne?._sum.score ?? 0,
        };
      }),
    );
  }

  async tableau(acteur: Acteur): Promise<TableauStudio> {
    const [lecons, statistiques, { notifications, nonLues }] = await Promise.all([
      this.mesLecons(acteur),
      this.statistiques(acteur.id),
      this.notifications.recentes(acteur.id),
    ]);
    return { lecons, statistiques, notifications, notificationsNonLues: nonLues };
  }
}
