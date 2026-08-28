import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  CHAPITRES_PAR_MATIERE,
  COMPTES_DEMO_SEED,
  LECONS_PAR_CHAPITRE,
  MATIERES_SEED,
  NIVEAUX_SEED,
  seedAll,
} from "./seed";

function makeUpsertModel(keyOf: (where: unknown) => string) {
  const store = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  const upsert = vi.fn(
    async ({ where, create }: { where: unknown; create: Record<string, unknown> }) => {
      const key = keyOf(where);
      const existing = store.get(key);
      if (existing) return existing;

      idCounter += 1;
      const record = { id: `id-${idCounter}`, ...create };
      store.set(key, record);
      return record;
    },
  );

  return { upsert, store };
}

function createMockPrisma() {
  const niveau = makeUpsertModel((w) => (w as { libelle: string }).libelle);
  const matiere = makeUpsertModel((w) => (w as { libelle: string }).libelle);
  const chapitre = makeUpsertModel((w) =>
    JSON.stringify((w as { niveauId_matiereId_ordre: unknown }).niveauId_matiereId_ordre),
  );
  const lecon = makeUpsertModel((w) =>
    JSON.stringify((w as { chapitreId_ordre: unknown }).chapitreId_ordre),
  );
  const quiz = makeUpsertModel((w) => (w as { leconId: string }).leconId);
  const user = makeUpsertModel((w) => (w as { email: string }).email);

  const prisma = {
    niveau: { upsert: niveau.upsert },
    matiere: { upsert: matiere.upsert },
    chapitre: { upsert: chapitre.upsert },
    lecon: { upsert: lecon.upsert },
    quiz: { upsert: quiz.upsert },
    user: { upsert: user.upsert },
  } as unknown as PrismaClient;

  const stores = { niveau, matiere, chapitre, lecon, quiz, user };

  return { prisma, stores };
}

describe("seedAll", () => {
  it("crée le nombre attendu d'enregistrements", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);

    const attendus = {
      niveaux: NIVEAUX_SEED.length,
      matieres: MATIERES_SEED.length,
      chapitres: NIVEAUX_SEED.length * MATIERES_SEED.length * CHAPITRES_PAR_MATIERE,
      lecons: NIVEAUX_SEED.length * MATIERES_SEED.length * CHAPITRES_PAR_MATIERE * LECONS_PAR_CHAPITRE,
      quiz: NIVEAUX_SEED.length * MATIERES_SEED.length * CHAPITRES_PAR_MATIERE * LECONS_PAR_CHAPITRE,
      users: COMPTES_DEMO_SEED.length,
    };

    expect(stores.niveau.store.size).toBe(attendus.niveaux);
    expect(stores.matiere.store.size).toBe(attendus.matieres);
    expect(stores.chapitre.store.size).toBe(attendus.chapitres);
    expect(stores.lecon.store.size).toBe(attendus.lecons);
    expect(stores.quiz.store.size).toBe(attendus.quiz);
    expect(stores.user.store.size).toBe(attendus.users);
  });

  it("est idempotent : relancer le seed ne duplique rien", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);
    const tailleApresPremierPassage = {
      niveaux: stores.niveau.store.size,
      matieres: stores.matiere.store.size,
      chapitres: stores.chapitre.store.size,
      lecons: stores.lecon.store.size,
      quiz: stores.quiz.store.size,
      users: stores.user.store.size,
    };

    await seedAll(prisma);
    const tailleApresSecondPassage = {
      niveaux: stores.niveau.store.size,
      matieres: stores.matiere.store.size,
      chapitres: stores.chapitre.store.size,
      lecons: stores.lecon.store.size,
      quiz: stores.quiz.store.size,
      users: stores.user.store.size,
    };

    expect(tailleApresSecondPassage).toEqual(tailleApresPremierPassage);
  });
});
