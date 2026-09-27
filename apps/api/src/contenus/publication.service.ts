import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Lecon, type VersionLecon } from "@prisma/client";
import {
  quizBrouillonSchema,
  slugifier,
  type CreerChapitreDto,
  type CreerLeconDto,
  type ModifierChapitreDto,
  type ModifierLeconDto,
  type QuizBrouillon,
} from "@xel-e/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { planifierSynchronisation } from "../studio/quiz-brouillon";
import { rendreLecon, type LeconRendue } from "./rendu-markdown";
import { appliquerAction, verifierAcces, verifierDroit, type Acteur, type ActionLecon } from "./workflow";

const LECON_INTROUVABLE = "Leçon introuvable.";
const CHAPITRE_INTROUVABLE = "Chapitre introuvable.";
const MODIFIEE_AILLEURS = "La leçon vient d'être modifiée par ailleurs. Recharge-la.";

export type ModificationLecon = ModifierLeconDto & { quiz?: QuizBrouillon };

function conflitOrdre(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException("Cet ordre est déjà utilisé dans ce chapitre.");
  }
  throw error;
}

// Le quiz en cours d'édition est relu avec la leçon, puis appliqué au quiz en ligne à la publication.
async function appliquerQuiz(tx: Prisma.TransactionClient, leconId: string, brouillon: QuizBrouillon): Promise<void> {
  if (brouillon.length === 0) {
    // Quiz retiré : masqué (l'historique des tentatives reste consultable).
    await tx.quiz.updateMany({ where: { leconId, deletedAt: null }, data: { deletedAt: new Date() } });
    return;
  }
  const quiz = await tx.quiz.upsert({
    where: { leconId },
    update: { deletedAt: null },
    create: { leconId },
    include: { questions: { select: { id: true } } },
  });
  const plan = planifierSynchronisation(
    quiz.questions.map((q) => q.id),
    brouillon,
  );
  if (plan.aSupprimer.length > 0) await tx.question.deleteMany({ where: { id: { in: plan.aSupprimer } } });
  for (const { id, donnees } of plan.aModifier) {
    await tx.question.update({ where: { id }, data: { ...donnees, choix: donnees.choix ?? Prisma.DbNull } });
  }
  if (plan.aCreer.length > 0) {
    await tx.question.createMany({
      data: plan.aCreer.map((donnees) => ({ ...donnees, quizId: quiz.id, choix: donnees.choix ?? Prisma.DbNull })),
    });
  }
}

@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async creerChapitre(dto: CreerChapitreDto) {
    const [niveau, matiere] = await Promise.all([
      this.prisma.niveau.findUniqueOrThrow({ where: { libelle: dto.niveau } }),
      this.prisma.matiere.findUniqueOrThrow({ where: { libelle: dto.matiere } }),
    ]);
    const ordre =
      dto.ordre ??
      ((await this.prisma.chapitre.aggregate({
        where: { niveauId: niveau.id, matiereId: matiere.id },
        _max: { ordre: true },
      }))._max.ordre ?? 0) + 1;
    return this.prisma.chapitre
      .create({ data: { niveauId: niveau.id, matiereId: matiere.id, titre: dto.titre, ordre } })
      .catch(conflitOrdre);
  }

  async modifierChapitre(id: string, dto: ModifierChapitreDto) {
    await this.chapitreActif(id);
    return this.prisma.chapitre.update({ where: { id }, data: dto }).catch(conflitOrdre);
  }

  async supprimerChapitre(id: string): Promise<void> {
    await this.chapitreActif(id);
    await this.prisma.chapitre.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listerChapitres(niveau: string, matiere: string) {
    return this.prisma.chapitre.findMany({
      where: { niveau: { libelle: niveau }, matiere: { libelle: matiere }, deletedAt: null },
      orderBy: { ordre: "asc" },
      include: {
        lecons: {
          where: { deletedAt: null },
          orderBy: { ordre: "asc" },
          select: { id: true, slug: true, titre: true, statut: true, version: true, ordre: true },
        },
      },
    });
  }

  private async chapitreActif(id: string) {
    const chapitre = await this.prisma.chapitre.findFirst({ where: { id, deletedAt: null } });
    if (!chapitre) throw new NotFoundException(CHAPITRE_INTROUVABLE);
    return chapitre;
  }

  private async slugDisponible(titre: string): Promise<string> {
    const base = slugifier(titre) || "lecon";
    for (let suffixe = 1; ; suffixe += 1) {
      const candidat = suffixe === 1 ? base : `${base}-${suffixe}`;
      if (!(await this.prisma.lecon.findUnique({ where: { slug: candidat } }))) return candidat;
    }
  }

  async creerLecon(dto: CreerLeconDto, auteurId: string): Promise<Lecon> {
    await this.chapitreActif(dto.chapitreId);
    const ordre =
      dto.ordre ??
      ((await this.prisma.lecon.aggregate({ where: { chapitreId: dto.chapitreId }, _max: { ordre: true } }))
        ._max.ordre ?? 0) + 1;
    return this.prisma.lecon
      .create({
        data: {
          chapitreId: dto.chapitreId,
          titre: dto.titre,
          contenu: dto.contenu ?? "",
          ordre,
          auteurId,
          slug: await this.slugDisponible(dto.titre),
        },
      })
      .catch(conflitOrdre);
  }

  // Sans acteur : accès administrateur. Avec un professeur : uniquement ses propres leçons.
  async lecon(id: string, acteur?: Acteur) {
    const lecon = await this.prisma.lecon.findFirst({
      where: { id, deletedAt: null },
      include: {
        versionPubliee: { select: { numero: true, titre: true, publieLe: true } },
        chapitre: { include: { niveau: true, matiere: true } },
      },
    });
    if (!lecon) throw new NotFoundException(LECON_INTROUVABLE);
    if (acteur) verifierAcces(acteur, lecon);
    return lecon;
  }

  async apercu(id: string, acteur?: Acteur): Promise<LeconRendue> {
    return rendreLecon((await this.lecon(id, acteur)).contenu ?? "");
  }

  private async transition(
    id: string,
    action: ActionLecon,
    acteur: Acteur,
    data: Prisma.LeconUpdateManyMutationInput = {},
  ) {
    const lecon = await this.lecon(id);
    verifierDroit(acteur, action, lecon);
    const statut = appliquerAction(lecon.statut, action);
    // Mise à jour conditionnelle : échoue si une autre requête a changé le statut entre-temps.
    const { count } = await this.prisma.lecon
      .updateMany({ where: { id, statut: lecon.statut, deletedAt: null }, data: { ...data, statut } })
      .catch(conflitOrdre);
    if (count !== 1) throw new ConflictException(MODIFIEE_AILLEURS);
    return { avant: lecon, apres: await this.lecon(id) };
  }

  // Prévient l'auteur d'un changement de statut décidé par quelqu'un d'autre.
  private async notifierAuteur(lecon: { auteurId: string | null }, acteur: Acteur, contenu: string) {
    if (lecon.auteurId && lecon.auteurId !== acteur.id) {
      await this.notifications.notifier([lecon.auteurId], "REVUE", contenu);
    }
  }

  async modifierLecon(id: string, dto: ModificationLecon, acteur: Acteur) {
    const { quiz, ...champs } = dto;
    const { avant, apres } = await this.transition(id, "modifier", acteur, {
      ...champs,
      ...(quiz !== undefined ? { quizBrouillon: quiz as unknown as Prisma.InputJsonValue } : {}),
    });
    if (avant.statut === "PUBLIE") {
      await this.notifierAuteur(avant, acteur, `Ta leçon « ${avant.titre} » a été modifiée par l'administration : une nouvelle version est en brouillon.`);
    }
    return apres;
  }

  async soumettre(id: string, acteur: Acteur) {
    const lecon = await this.lecon(id);
    verifierDroit(acteur, "soumettre", lecon);
    if (!lecon.contenu?.trim()) {
      throw new BadRequestException("Une leçon vide ne peut pas être soumise à la revue.");
    }
    if (lecon.quizBrouillon !== null && !quizBrouillonSchema.safeParse(lecon.quizBrouillon).success) {
      throw new BadRequestException("Le quiz de cette leçon est incomplet : corrige-le avant de soumettre.");
    }
    const { apres } = await this.transition(id, "soumettre", acteur, { soumisLe: new Date() });
    await this.notifications.notifierAdmins("REVUE", `Nouvelle leçon à relire : « ${apres.titre} » (${apres.chapitre.niveau.libelle}).`, acteur.id);
    await this.notifierAuteur(apres, acteur, `Ta leçon « ${apres.titre} » a été soumise à la revue.`);
    return apres;
  }

  // Refus motivé : la leçon revient en brouillon, le commentaire reste attaché à la leçon.
  async rejeter(id: string, commentaire: string, acteur: Acteur) {
    const { apres } = await this.transition(id, "rejeter", acteur, { soumisLe: null });
    await this.prisma.commentaireRevue.create({ data: { leconId: id, auteurId: acteur.id, contenu: commentaire } });
    await this.notifierAuteur(apres, acteur, `Ta leçon « ${apres.titre} » a été renvoyée en brouillon : ${commentaire}`);
    return apres;
  }

  // Publier fige un instantané immuable (titre, source, rendu HTML) : les élèves lisent
  // toujours cette version, même si la copie de travail est ensuite modifiée.
  async publier(id: string, acteur: Acteur): Promise<VersionLecon> {
    const lecon = await this.lecon(id);
    verifierDroit(acteur, "publier", lecon);
    appliquerAction(lecon.statut, "publier");
    const contenu = lecon.contenu ?? "";
    const rendu = rendreLecon(contenu);
    let quiz: QuizBrouillon | null = null;
    if (lecon.quizBrouillon !== null) {
      const lu = quizBrouillonSchema.safeParse(lecon.quizBrouillon);
      if (!lu.success) throw new BadRequestException("Le quiz de cette leçon est incomplet : il ne peut pas être publié.");
      quiz = lu.data;
    }

    const version = await this.prisma.$transaction(async (tx) => {
      const numero = lecon.version + 1;
      const { count } = await tx.lecon.updateMany({
        where: { id, statut: "EN_REVUE", version: lecon.version, deletedAt: null },
        data: { statut: "PUBLIE", version: numero, soumisLe: null, quizBrouillon: Prisma.DbNull },
      });
      if (count !== 1) throw new ConflictException(MODIFIEE_AILLEURS);

      const creee = await tx.versionLecon.create({
        data: {
          leconId: id,
          numero,
          titre: lecon.titre,
          contenu,
          sections: rendu.sections as unknown as Prisma.InputJsonValue,
          resume: rendu.resume,
          publieParId: acteur.id,
        },
      });
      await tx.lecon.update({ where: { id }, data: { versionPublieeId: creee.id } });
      if (quiz) await appliquerQuiz(tx, id, quiz);
      return creee;
    });
    await this.notifierAuteur(lecon, acteur, `Ta leçon « ${lecon.titre} » est publiée : les élèves peuvent la lire.`);
    return version;
  }

  async supprimerLecon(id: string): Promise<void> {
    await this.lecon(id);
    await this.prisma.lecon.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // Un professeur ne peut supprimer qu'un brouillon jamais publié : une leçon en ligne reste en ligne.
  async supprimerBrouillon(id: string, acteur: Acteur): Promise<void> {
    const lecon = await this.lecon(id, acteur);
    if (lecon.statut !== "BROUILLON" || lecon.version > 0) {
      throw new ConflictException("Seul un brouillon jamais publié peut être supprimé.");
    }
    const { count } = await this.prisma.lecon.updateMany({
      where: { id, statut: "BROUILLON", version: 0, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count !== 1) throw new ConflictException(MODIFIEE_AILLEURS);
  }
}
