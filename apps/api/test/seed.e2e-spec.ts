import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHAPITRES_PAR_MATIERE,
  COMPTES_DEMO_SEED,
  LECONS_PAR_CHAPITRE,
  MATIERES_SEED,
  NIVEAUX_SEED,
  QUIZ_DEMO,
  seedAll,
} from "../prisma/seed";
import { viderBase } from "./helpers";

const prisma = new PrismaClient();

const CHAPITRES_ATTENDUS = NIVEAUX_SEED.length * MATIERES_SEED.length * CHAPITRES_PAR_MATIERE;
const LECONS_ATTENDUES = CHAPITRES_ATTENDUS * LECONS_PAR_CHAPITRE;

describe("reset + seed (e2e)", () => {
  beforeAll(async () => {
    await viderBase(prisma);
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
    await expect(prisma.versionLecon.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.question.count()).resolves.toBe((LECONS_ATTENDUES - 1) * 3 + QUIZ_DEMO.length);
  });

  it("ne duplique rien si le seed est relancé", async () => {
    await seedAll(prisma);

    await expect(prisma.niveau.count()).resolves.toBe(NIVEAUX_SEED.length);
    await expect(prisma.chapitre.count()).resolves.toBe(CHAPITRES_ATTENDUS);
    await expect(prisma.lecon.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.user.count()).resolves.toBe(COMPTES_DEMO_SEED.length);
    await expect(prisma.versionLecon.count()).resolves.toBe(LECONS_ATTENDUES);
    await expect(prisma.question.count()).resolves.toBe((LECONS_ATTENDUES - 1) * 3 + QUIZ_DEMO.length);
  });
});
