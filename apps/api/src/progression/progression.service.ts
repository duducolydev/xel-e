import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma, type SourceXp } from "@prisma/client";
import {
  INFOS_MATIERES,
  type Activite,
  type AvancementMatiere,
  type BadgeObtenu,
  type Classement,
  type EtatLeconEleve,
  type Gains,
  type ReglageClassementDto,
  type ResultatLeconTerminee,
  type TableauDeBordProgression,
} from "@xel-e/shared";
import { FILTRE_LECONS_PUBLIQUES } from "../contenus/workflow";
import { PrismaService } from "../prisma/prisma.service";
import {
  avancement,
  BADGES,
  badgesMerites,
  classer,
  SEUIL_QUIZ_REUSSI,
  XP,
  type EtatLecon,
  type Statistiques,
} from "./regles";
import { enregistrerJourActif, serieCourante } from "./serie";
import { debutSemaine, jourLocal } from "./temps";

const TAILLE_CLASSEMENT = 20;

function estConflitUnicite(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class ProgressionService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  // Le catalogue des badges vit dans le code ; la table est alignée à chaque démarrage.
  async onModuleInit(): Promise<void> {
    await this.synchroniserBadges();
  }

  async synchroniserBadges(): Promise<void> {
    for (const badge of BADGES) await this.badgeDuCatalogue(badge.code);
  }

  // Crée la ligne du badge si elle manque : l'attribution ne dépend pas d'une synchronisation préalable.
  private badgeDuCatalogue(code: string) {
    const badge = BADGES.find((b) => b.code === code);
    if (!badge) throw new Error(`Badge inconnu du catalogue : ${code}`);
    return this.prisma.badge.upsert({
      where: { code },
      update: { libelle: badge.libelle, description: badge.description },
      create: { code, libelle: badge.libelle, description: badge.description },
    });
  }

  // Gain unique par (élève, source, clé) : l'unicité en base rend l'opération idempotente.
  private async accorderXp(utilisateurId: string, source: SourceXp, cle: string, xp: number, le: Date): Promise<number> {
    try {
      await this.prisma.gainXp.create({ data: { utilisateurId, source, cle, xp, gagneLe: le } });
      return xp;
    } catch (error) {
      if (estConflitUnicite(error)) return 0;
      throw error;
    }
  }

  private async marquerJourActif(utilisateurId: string, maintenant: Date): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: utilisateurId },
      select: { serieJours: true, serieRecord: true, dernierJourActif: true },
    });
    const suivant = enregistrerJourActif(user, jourLocal(maintenant));
    if (suivant === user) return;
    // Conditionnel : deux événements simultanés n'incrémentent la série qu'une fois.
    await this.prisma.user.updateMany({
      where: { id: utilisateurId, dernierJourActif: user.dernierJourActif },
      data: suivant,
    });
  }

  private async statistiques(utilisateurId: string): Promise<Statistiques> {
    const [leconsTerminees, quizReussis, quizParfaits, user, progressions] = await Promise.all([
      this.prisma.progression.count({ where: { utilisateurId, termineLe: { not: null } } }),
      this.prisma.progression.count({ where: { utilisateurId, quizReussiLe: { not: null } } }),
      this.prisma.gainXp.count({ where: { utilisateurId, source: "QUIZ_PARFAIT" } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: utilisateurId }, select: { serieRecord: true } }),
      this.prisma.progression.findMany({ where: { utilisateurId }, select: { lecon: { select: { chapitreId: true } } } }),
    ]);
    const chapitresTouches = [...new Set(progressions.map((p) => p.lecon.chapitreId))];
    const avancements = await this.avancementsChapitres(utilisateurId, { id: { in: chapitresTouches } });
    return {
      leconsTerminees,
      quizReussis,
      quizParfaits,
      chapitresCompletes: avancements.filter((a) => a.avancement.complet).length,
      serieRecord: user.serieRecord,
    };
  }

  private async attribuerBadges(utilisateurId: string): Promise<BadgeObtenu[]> {
    const merites = badgesMerites(await this.statistiques(utilisateurId));
    const dejaObtenus = new Set(
      (await this.prisma.badgeUtilisateur.findMany({ where: { utilisateurId }, select: { badge: { select: { code: true } } } })).map(
        (b) => b.badge.code,
      ),
    );
    const nouveaux: BadgeObtenu[] = [];
    for (const code of merites.filter((c) => !dejaObtenus.has(c))) {
      const badge = await this.badgeDuCatalogue(code);
      try {
        await this.prisma.badgeUtilisateur.create({ data: { utilisateurId, badgeId: badge.id } });
      } catch (error) {
        // Attribué entre-temps par un autre événement : pas de doublon, pas de seconde notification.
        if (estConflitUnicite(error)) continue;
        throw error;
      }
      const obtenu = { code, libelle: badge.libelle, description: badge.description ?? "" };
      nouveaux.push(obtenu);
      await this.prisma.notification.create({
        data: { utilisateurId, type: "BADGE", contenu: `Nouveau badge : ${obtenu.libelle} — ${obtenu.description}` },
      });
    }
    return nouveaux;
  }

  private async leconPubliee(slug: string) {
    const lecon = await this.prisma.lecon.findFirst({ where: { slug, ...FILTRE_LECONS_PUBLIQUES }, select: { id: true } });
    if (!lecon) throw new NotFoundException("Cette leçon n'existe pas ou n'est pas encore publiée.");
    return lecon;
  }

  async terminerLecon(slug: string, utilisateurId: string, maintenant = new Date()): Promise<ResultatLeconTerminee> {
    const lecon = await this.leconPubliee(slug);
    const existante = await this.prisma.progression.findUnique({
      where: { utilisateurId_leconId: { utilisateurId, leconId: lecon.id } },
    });
    if (existante?.termineLe) return { dejaTerminee: true, xp: 0, badges: [] };

    await this.prisma.progression.upsert({
      where: { utilisateurId_leconId: { utilisateurId, leconId: lecon.id } },
      update: { termineLe: maintenant },
      create: { utilisateurId, leconId: lecon.id, termineLe: maintenant },
    });
    const xp = await this.accorderXp(utilisateurId, "LECON_TERMINEE", lecon.id, XP.LECON_TERMINEE, maintenant);
    await this.marquerJourActif(utilisateurId, maintenant);
    return { dejaTerminee: false, xp, badges: await this.attribuerBadges(utilisateurId) };
  }

  // Appelé à chaque soumission de quiz : jour actif dans tous les cas, XP seulement la première
  // réussite (et le premier sans-faute) de ce quiz.
  async enregistrerQuizSoumis(utilisateurId: string, quizId: string, score: number, maintenant = new Date()): Promise<Gains> {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({ where: { id: quizId }, select: { leconId: true } });
    const cle = { utilisateurId_leconId: { utilisateurId, leconId: quiz.leconId } };
    const reussi = score >= SEUIL_QUIZ_REUSSI;
    const existante = await this.prisma.progression.findUnique({ where: cle });

    await this.prisma.progression.upsert({
      where: cle,
      update: {
        meilleurScore: Math.max(existante?.meilleurScore ?? 0, score),
        ...(reussi && !existante?.quizReussiLe ? { quizReussiLe: maintenant } : {}),
      },
      create: { utilisateurId, leconId: quiz.leconId, meilleurScore: score, quizReussiLe: reussi ? maintenant : null },
    });

    let xp = 0;
    if (reussi) xp += await this.accorderXp(utilisateurId, "QUIZ_REUSSI", quizId, XP.QUIZ_REUSSI, maintenant);
    if (score >= 100) xp += await this.accorderXp(utilisateurId, "QUIZ_PARFAIT", quizId, XP.QUIZ_PARFAIT, maintenant);
    await this.marquerJourActif(utilisateurId, maintenant);
    return { xp, badges: await this.attribuerBadges(utilisateurId) };
  }

  async etatLecon(slug: string, utilisateurId: string): Promise<EtatLeconEleve> {
    const lecon = await this.leconPubliee(slug);
    const progression = await this.prisma.progression.findUnique({
      where: { utilisateurId_leconId: { utilisateurId, leconId: lecon.id } },
    });
    return {
      terminee: !!progression?.termineLe,
      quizReussi: !!progression?.quizReussiLe,
      meilleurScore: progression?.meilleurScore ?? null,
    };
  }

  private async avancementsChapitres(utilisateurId: string, filtre: Prisma.ChapitreWhereInput) {
    const chapitres = await this.prisma.chapitre.findMany({
      where: { ...filtre, deletedAt: null },
      orderBy: { ordre: "asc" },
      select: {
        titre: true,
        matiere: { select: { libelle: true } },
        lecons: {
          where: FILTRE_LECONS_PUBLIQUES,
          select: {
            quiz: { select: { deletedAt: true, _count: { select: { questions: true } } } },
            progressions: { where: { utilisateurId }, select: { termineLe: true, quizReussiLe: true } },
          },
        },
      },
    });
    return chapitres.map((chapitre) => {
      const lecons: EtatLecon[] = chapitre.lecons.map((lecon) => {
        const progression = lecon.progressions[0];
        return {
          terminee: !!progression?.termineLe,
          aUnQuiz: !!lecon.quiz && lecon.quiz.deletedAt === null && lecon.quiz._count.questions > 0,
          quizReussi: !!progression?.quizReussiLe,
        };
      });
      return { titre: chapitre.titre, matiere: chapitre.matiere.libelle, lecons, avancement: avancement(lecons) };
    });
  }

  async tableauDeBord(utilisateurId: string, maintenant = new Date()): Promise<TableauDeBordProgression> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: utilisateurId },
      select: { serieJours: true, serieRecord: true, dernierJourActif: true, niveauId: true, niveau: { select: { libelle: true } } },
    });

    const [total, semaine, badgesObtenus, progressions, tentatives, notifications, nonLues] = await Promise.all([
      this.prisma.gainXp.aggregate({ where: { utilisateurId }, _sum: { xp: true } }),
      this.prisma.gainXp.aggregate({ where: { utilisateurId, gagneLe: { gte: debutSemaine(maintenant) } }, _sum: { xp: true } }),
      this.prisma.badgeUtilisateur.findMany({ where: { utilisateurId }, include: { badge: true } }),
      this.prisma.progression.findMany({
        where: { utilisateurId, termineLe: { not: null } },
        orderBy: { termineLe: "desc" },
        take: 10,
        select: { termineLe: true, lecon: { select: { slug: true, versionPubliee: { select: { titre: true } } } } },
      }),
      this.prisma.tentative.findMany({
        where: { utilisateurId, termineLe: { not: null } },
        orderBy: { termineLe: "desc" },
        take: 10,
        select: { termineLe: true, score: true, quiz: { select: { lecon: { select: { slug: true, versionPubliee: { select: { titre: true } } } } } } },
      }),
      this.prisma.notification.findMany({ where: { utilisateurId }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.notification.count({ where: { utilisateurId, lu: false } }),
    ]);

    const matieres: AvancementMatiere[] = [];
    if (user.niveauId) {
      const chapitres = await this.avancementsChapitres(utilisateurId, { niveauId: user.niveauId });
      for (const info of Object.values(INFOS_MATIERES)) {
        const deLaMatiere = chapitres.filter((c) => c.matiere === info.libelle && c.lecons.length > 0);
        matieres.push({
          slug: info.slug,
          nom: info.nom,
          pourcentage: avancement(deLaMatiere.flatMap((c) => c.lecons)).pourcentage,
          chapitres: deLaMatiere.map((c) => ({ titre: c.titre, ...c.avancement })),
        });
      }
    }

    const activites: Activite[] = [
      ...progressions.map((p) => ({
        type: "lecon" as const,
        titre: p.lecon.versionPubliee?.titre ?? "",
        slug: p.lecon.slug,
        score: null,
        le: (p.termineLe as Date).toISOString(),
      })),
      ...tentatives.map((t) => ({
        type: "quiz" as const,
        titre: t.quiz.lecon.versionPubliee?.titre ?? "",
        slug: t.quiz.lecon.slug,
        score: t.score,
        le: (t.termineLe as Date).toISOString(),
      })),
    ]
      .sort((a, b) => b.le.localeCompare(a.le))
      .slice(0, 10);

    const obtenus = new Map(badgesObtenus.map((b) => [b.badge.code, b.obtenuLe]));
    return {
      niveau: user.niveau?.libelle ?? null,
      xpTotal: total._sum.xp ?? 0,
      xpSemaine: semaine._sum.xp ?? 0,
      serie: { actuelle: serieCourante(user, jourLocal(maintenant)), record: user.serieRecord },
      matieres,
      badges: BADGES.map((b) => ({
        code: b.code,
        libelle: b.libelle,
        description: b.description,
        obtenuLe: obtenus.get(b.code)?.toISOString() ?? null,
      })),
      activites,
      notifications: notifications.map((n) => ({ id: n.id, contenu: n.contenu, lu: n.lu, createdAt: n.createdAt.toISOString() })),
      notificationsNonLues: nonLues,
    };
  }

  async marquerNotificationsLues(utilisateurId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { utilisateurId, lu: false }, data: { lu: true } });
  }

  async reglerClassement(utilisateurId: string, dto: ReglageClassementDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: utilisateurId }, select: { role: true } });
    if (user.role !== "ELEVE") throw new ForbiddenException("Le classement est réservé aux élèves.");
    try {
      await this.prisma.user.update({
        where: { id: utilisateurId },
        data: dto.actif ? { classementActif: true, pseudonyme: dto.pseudonyme } : { classementActif: false },
      });
    } catch (error) {
      if (estConflitUnicite(error)) {
        throw new ConflictException({
          statusCode: 409,
          message: "Ce pseudonyme est déjà pris.",
          erreurs: { pseudonyme: "Ce pseudonyme est déjà pris." },
        });
      }
      throw error;
    }
  }

  // Classement de la semaine (lundi 00:00, heure de Dakar), limité aux élèves du même niveau
  // qui l'ont activé. Seuls les pseudonymes et l'XP sont exposés.
  async classement(utilisateurId: string, maintenant = new Date()): Promise<Classement> {
    const moi = await this.prisma.user.findUniqueOrThrow({
      where: { id: utilisateurId },
      select: { niveauId: true, classementActif: true, pseudonyme: true, niveau: { select: { libelle: true } } },
    });
    const debut = debutSemaine(maintenant);
    const base = {
      niveau: moi.niveau?.libelle ?? null,
      debutSemaine: debut.toISOString(),
      participe: moi.classementActif,
      pseudonyme: moi.pseudonyme,
    };
    if (!moi.niveauId) return { ...base, lignes: [], monRang: null };

    const participants = await this.prisma.user.findMany({
      where: { role: "ELEVE", classementActif: true, niveauId: moi.niveauId, deletedAt: null, pseudonyme: { not: null } },
      select: { id: true, pseudonyme: true },
    });
    const xp = await this.prisma.gainXp.groupBy({
      by: ["utilisateurId"],
      where: { utilisateurId: { in: participants.map((p) => p.id) }, gagneLe: { gte: debut } },
      _sum: { xp: true },
    });
    const xpPar = new Map(xp.map((ligne) => [ligne.utilisateurId, ligne._sum.xp ?? 0]));
    const classes = classer(
      participants.map((p) => ({ utilisateurId: p.id, pseudonyme: p.pseudonyme as string, xp: xpPar.get(p.id) ?? 0 })),
    ).map((e) => ({ rang: e.rang, pseudonyme: e.pseudonyme, xp: e.xp, estMoi: e.utilisateurId === utilisateurId }));

    return {
      ...base,
      lignes: classes.slice(0, TAILLE_CLASSEMENT),
      monRang: classes.find((ligne) => ligne.estMoi) ?? null,
    };
  }
}
