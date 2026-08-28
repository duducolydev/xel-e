import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHAPITRES_PAR_MATIERE,
  COMPTES_DEMO_SEED,
  LECONS_PAR_CHAPITRE,
  MATIERES_SEED,
  NIVEAUX_SEED,
  seedAll,
} from "../prisma/seed";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.signalement.deleteMany();
  await prisma.message.deleteMany();
  await prisma.sujetForum.deleteMany();
  await prisma.badgeUtilisateur.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.progression.deleteMany();
  await prisma.tentative.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.lecon.deleteMany();
  await prisma.chapitre.deleteMany();
  await prisma.paiement.deleteMany();
  await prisma.abonnement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.parentLink.deleteMany();
  await prisma.user.deleteMany();
  await prisma.matiere.deleteMany();
  await prisma.niveau.deleteMany();
}

const CHAPITRES_ATTENDUS = NIVEAUX_SEED.length * MATIERES_SEED.length * CHAPITRES_PAR_MATIERE;
const LECONS_ATTENDUES = CHAPITRES_ATTENDUS * LECONS_PAR_CHAPITRE;

describe("reset + seed (e2e)", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("crée le nombre attendu de niveaux, matières, chapitres, leçons et quiz", async () => {
    await expect(prisma.niveau.count()).resolves.toBe(NIVEAUX_SEED.length);
    await expect(prisma.matiere.count()).resolves.toBe(MATIERES_SEED.length);
    await expect(prisma.chapitre.count()).resolves.toBe(CHAPITRES_ATTENDUS);
    await expect(prisma.lecon.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.quiz.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.user.count()).resolves.toBe(COMPTES_DEMO_SEED.length);
  });

  it("ne duplique rien si le seed est relancé", async () => {
    await seedAll(prisma);

    await expect(prisma.niveau.count()).resolves.toBe(NIVEAUX_SEED.length);
    await expect(prisma.chapitre.count()).resolves.toBe(CHAPITRES_ATTENDUS);
    await expect(prisma.lecon.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.user.count()).resolves.toBe(COMPTES_DEMO_SEED.length);
  });
});
