import { Injectable } from "@nestjs/common";
import type { Niveau, TableauEnfant } from "@xel-e/shared";
import { consentementParentalRequis } from "../auth/acces-forum";
import { PrismaService } from "../prisma/prisma.service";
import { serieCourante } from "../progression/serie";
import { debutSemaine, decalerJour, jourLocal } from "../progression/temps";
import type { ActiviteEnfant } from "./resume";

const JOURS_AFFICHES = 7;

export interface Intervalle {
  debut: Date;
  fin: Date;
  premierJour: string;
  dernierJour: string;
}

// Données de suivi d'un élève, lues pour son parent (tableau de bord et résumés).
@Injectable()
export class SuiviService {
  constructor(private readonly prisma: PrismaService) {}

  private enfant(enfantId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: enfantId },
      select: {
        id: true,
        nomComplet: true,
        role: true,
        statutCompte: true,
        email: true,
        emailConfirmeLe: true,
        naissanceMois: true,
        naissanceAnnee: true,
        consentementParentalLe: true,
        serieJours: true,
        serieRecord: true,
        dernierJourActif: true,
        niveau: { select: { libelle: true } },
      },
    });
  }

  async activiteEntre(enfantId: string, intervalle: Intervalle, maintenant: Date): Promise<ActiviteEnfant> {
    const [enfant, jours, lecons, tentatives] = await Promise.all([
      this.enfant(enfantId),
      this.prisma.activiteJour.findMany({
        where: { utilisateurId: enfantId, jour: { gte: intervalle.premierJour, lte: intervalle.dernierJour } },
        select: { minutes: true },
      }),
      this.prisma.progression.findMany({
        where: { utilisateurId: enfantId, termineLe: { gte: intervalle.debut, lt: intervalle.fin } },
        orderBy: { termineLe: "asc" },
        select: { lecon: { select: { titre: true, versionPubliee: { select: { titre: true } } } } },
      }),
      this.prisma.tentative.findMany({
        where: { utilisateurId: enfantId, termineLe: { gte: intervalle.debut, lt: intervalle.fin } },
        orderBy: { termineLe: "asc" },
        select: { score: true, quiz: { select: { lecon: { select: { titre: true, versionPubliee: { select: { titre: true } } } } } } },
      }),
    ]);
    return {
      nomComplet: enfant.nomComplet,
      minutes: jours.reduce((total, j) => total + j.minutes, 0),
      joursActifs: jours.filter((j) => j.minutes > 0).length,
      leconsTerminees: lecons.map((p) => p.lecon.versionPubliee?.titre ?? p.lecon.titre),
      quiz: tentatives.map((t) => ({ titre: t.quiz.lecon.versionPubliee?.titre ?? t.quiz.lecon.titre, score: t.score ?? 0 })),
      serie: serieCourante(enfant, jourLocal(maintenant)),
    };
  }

  async tableau(enfantId: string, maintenant = new Date()): Promise<TableauEnfant> {
    const aujourdhui = jourLocal(maintenant);
    const premierJour = decalerJour(aujourdhui, -(JOURS_AFFICHES - 1));
    const lundi = debutSemaine(maintenant);
    const [enfant, jours, leconsTotal, leconsSemaine, dernieres, tentatives, xp] = await Promise.all([
      this.enfant(enfantId),
      this.prisma.activiteJour.findMany({
        where: { utilisateurId: enfantId, jour: { gte: premierJour, lte: aujourdhui } },
        select: { jour: true, minutes: true },
      }),
      this.prisma.progression.count({ where: { utilisateurId: enfantId, termineLe: { not: null } } }),
      this.prisma.progression.count({ where: { utilisateurId: enfantId, termineLe: { gte: lundi } } }),
      this.prisma.progression.findMany({
        where: { utilisateurId: enfantId, termineLe: { not: null } },
        orderBy: { termineLe: "desc" },
        take: 5,
        select: { termineLe: true, lecon: { select: { titre: true, versionPubliee: { select: { titre: true } } } } },
      }),
      this.prisma.tentative.findMany({
        where: { utilisateurId: enfantId, termineLe: { not: null } },
        orderBy: { termineLe: "desc" },
        take: 5,
        select: { score: true, termineLe: true, quiz: { select: { lecon: { select: { titre: true, versionPubliee: { select: { titre: true } } } } } } },
      }),
      this.prisma.gainXp.aggregate({ where: { utilisateurId: enfantId, gagneLe: { gte: lundi } }, _sum: { xp: true } }),
    ]);
    const minutesParJour = new Map(jours.map((j) => [j.jour, j.minutes]));
    const activite = Array.from({ length: JOURS_AFFICHES }, (_, i) => {
      const jour = decalerJour(premierJour, i);
      return { jour, minutes: minutesParJour.get(jour) ?? 0 };
    });
    const debutSemaineJour = jourLocal(lundi);
    return {
      enfant: { id: enfant.id, nomComplet: enfant.nomComplet, niveau: (enfant.niveau?.libelle as Niveau | undefined) ?? null },
      activite,
      minutesSemaine: activite.filter((a) => a.jour >= debutSemaineJour).reduce((total, a) => total + a.minutes, 0),
      leconsTerminees: {
        total: leconsTotal,
        semaine: leconsSemaine,
        dernieres: dernieres.map((p) => ({
          titre: p.lecon.versionPubliee?.titre ?? p.lecon.titre,
          le: (p.termineLe as Date).toISOString(),
        })),
      },
      scoresRecents: tentatives.map((t) => ({
        titre: t.quiz.lecon.versionPubliee?.titre ?? t.quiz.lecon.titre,
        score: t.score ?? 0,
        le: (t.termineLe as Date).toISOString(),
      })),
      serie: { actuelle: serieCourante(enfant, aujourdhui), record: enfant.serieRecord },
      xpSemaine: xp._sum.xp ?? 0,
      accordParental: { requis: consentementParentalRequis(enfant, maintenant), donne: enfant.consentementParentalLe !== null },
    };
  }
}
