import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SuiviService } from "./suivi.service";

const MAINTENANT = new Date("2026-10-08T12:00:00Z"); // jeudi

const ENFANT = {
  id: "e1",
  nomComplet: "Fatou Diop",
  role: "ELEVE",
  statutCompte: "ACTIF",
  email: null,
  emailConfirmeLe: null,
  naissanceMois: 3,
  naissanceAnnee: 2013,
  consentementParentalLe: null,
  serieJours: 2,
  serieRecord: 5,
  dernierJourActif: "2026-10-08",
  niveau: { libelle: "5e" },
};

const lecon = (titre: string, publie: string | null = titre) => ({ titre, versionPubliee: publie ? { titre: publie } : null });

function creerSuivi() {
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue(ENFANT) },
    activiteJour: { findMany: vi.fn().mockResolvedValue([]) },
    progression: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    tentative: { findMany: vi.fn().mockResolvedValue([]) },
    gainXp: { aggregate: vi.fn().mockResolvedValue({ _sum: { xp: null } }) },
  };
  return { service: new SuiviService(prisma as unknown as PrismaService), prisma };
}

describe("SuiviService — tableau de bord parent", () => {
  it("montre les 7 derniers jours (jours sans activité à 0) et le total de la semaine en cours", async () => {
    const { service, prisma } = creerSuivi();
    prisma.activiteJour.findMany.mockResolvedValue([
      { jour: "2026-10-03", minutes: 20 }, // samedi de la semaine précédente
      { jour: "2026-10-06", minutes: 15 },
      { jour: "2026-10-08", minutes: 30 },
    ]);

    const tableau = await service.tableau("e1", MAINTENANT);

    expect(prisma.activiteJour.findMany.mock.calls[0]?.[0].where).toEqual({
      utilisateurId: "e1",
      jour: { gte: "2026-10-02", lte: "2026-10-08" },
    });
    expect(tableau.activite).toEqual([
      { jour: "2026-10-02", minutes: 0 },
      { jour: "2026-10-03", minutes: 20 },
      { jour: "2026-10-04", minutes: 0 },
      { jour: "2026-10-05", minutes: 0 },
      { jour: "2026-10-06", minutes: 15 },
      { jour: "2026-10-07", minutes: 0 },
      { jour: "2026-10-08", minutes: 30 },
    ]);
    expect(tableau.minutesSemaine).toBe(45);
  });

  it("rassemble leçons, scores récents, série, XP et état de l'accord parental", async () => {
    const { service, prisma } = creerSuivi();
    prisma.progression.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    prisma.progression.findMany.mockResolvedValue([{ termineLe: new Date("2026-10-08T09:00:00Z"), lecon: lecon("Brouillon", "Pythagore") }]);
    prisma.tentative.findMany.mockResolvedValue([
      { score: 85, termineLe: new Date("2026-10-08T10:00:00Z"), quiz: { lecon: lecon("Pythagore") } },
      { score: null, termineLe: new Date("2026-10-07T10:00:00Z"), quiz: { lecon: lecon("Thalès", null) } },
    ]);
    prisma.gainXp.aggregate.mockResolvedValue({ _sum: { xp: 40 } });

    const tableau = await service.tableau("e1", MAINTENANT);

    expect(tableau).toMatchObject({
      enfant: { id: "e1", nomComplet: "Fatou Diop", niveau: "5e" },
      leconsTerminees: { total: 12, semaine: 3, dernieres: [{ titre: "Pythagore", le: "2026-10-08T09:00:00.000Z" }] },
      scoresRecents: [
        { titre: "Pythagore", score: 85 },
        { titre: "Thalès", score: 0 },
      ],
      serie: { actuelle: 2, record: 5 },
      xpSemaine: 40,
      accordParental: { requis: true, donne: false },
    });
  });

  it("résume l'activité d'une période pour le résumé envoyé aux parents", async () => {
    const { service, prisma } = creerSuivi();
    prisma.activiteJour.findMany.mockResolvedValue([{ minutes: 25 }, { minutes: 0 }, { minutes: 35 }]);
    prisma.progression.findMany.mockResolvedValue([{ lecon: lecon("Pythagore") }]);
    prisma.tentative.findMany.mockResolvedValue([{ score: 90, quiz: { lecon: lecon("Pythagore") } }]);
    const intervalle = {
      debut: new Date("2026-10-05T00:00:00Z"),
      fin: MAINTENANT,
      premierJour: "2026-10-05",
      dernierJour: "2026-10-11",
    };

    const activite = await service.activiteEntre("e1", intervalle, MAINTENANT);

    expect(prisma.progression.findMany.mock.calls[0]?.[0].where).toEqual({
      utilisateurId: "e1",
      termineLe: { gte: intervalle.debut, lt: intervalle.fin },
    });
    expect(activite).toEqual({
      nomComplet: "Fatou Diop",
      minutes: 60,
      joursActifs: 2,
      leconsTerminees: ["Pythagore"],
      quiz: [{ titre: "Pythagore", score: 90 }],
      serie: 2,
    });
  });
});
