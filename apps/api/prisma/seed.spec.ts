import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  CHAPITRES_PAR_MATIERE,
  COMPTES_DEMO_SEED,
  LECON_DEMO,
  LECONS_PAR_CHAPITRE,
  QUIZ_DEMO,
  MATIERES_SEED,
  NIVEAUX_SEED,
  seedAll,
} from "./seed";
import { EPREUVES_INITIALES } from "../src/bfem/epreuves-initiales";
import { TERMES_INITIAUX } from "../src/forum/termes-initiaux";

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
  const versions: Record<string, unknown>[] = [];
  const questions: Record<string, unknown>[] = [];
  const termes = new Set<string>();
  const epreuves: Record<string, unknown>[] = [];
  const plans: Record<string, unknown>[] = [];
  const examens: Record<string, unknown>[] = [];

  // Comme en base, une leçon créée sans « version » est à 0 (jamais publiée).
  const lecons = () => [...lecon.store.values()];
  const prisma = {
    niveau: { upsert: niveau.upsert },
    matiere: { upsert: matiere.upsert },
    chapitre: { upsert: chapitre.upsert },
    lecon: {
      upsert: lecon.upsert,
      findMany: vi.fn(async () => lecons().filter((l) => (l.version ?? 0) === 0 && !l.deletedAt)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(lecons().find((l) => l.id === where.id) ?? {}, data),
      ),
    },
    versionLecon: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const version = { id: `version-${versions.length + 1}`, ...data };
        versions.push(version);
        return version;
      }),
    },
    quiz: { upsert: quiz.upsert },
    question: {
      count: vi.fn(async ({ where }: { where: { quizId: string } }) => questions.filter((q) => q.quizId === where.quizId).length),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        questions.push(...data);
        return { count: data.length };
      }),
    },
    user: { upsert: user.upsert },
    epreuveBfem: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const existante = epreuves.find((e) => e.code === create.code);
        if (existante) return existante;
        const epreuve = { id: `epreuve-${epreuves.length + 1}`, ...create };
        epreuves.push(epreuve);
        return epreuve;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => epreuves.find((e) => e.code === where.code)),
    },
    examenBlanc: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => examens.find((e) => e.slug === where.slug) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        examens.push(data);
        return data;
      }),
    },
    plan: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        if (!plans.some((p) => p.code === create.code)) plans.push(create);
        return create;
      }),
    },
    termeInterdit: {
      createMany: vi.fn(async ({ data }: { data: { terme: string }[] }) => {
        for (const { terme } of data) termes.add(terme);
        return { count: data.length };
      }),
    },
  } as unknown as PrismaClient;

  const stores = { niveau, matiere, chapitre, lecon, quiz, user, versions, questions, termes, epreuves, examens, plans };

  return { prisma, stores };
}

// Seed purement CPU (hash argon2id des comptes, rendu KaTeX de 72 leçons), parfois deux fois par test :
// le délai par défaut de 5 s est trop juste sur une machine chargée.
describe("seedAll", { timeout: 30_000 }, () => {
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
    expect(stores.versions).toHaveLength(attendus.lecons);
    expect(stores.questions).toHaveLength((attendus.lecons - 1) * 3 + QUIZ_DEMO.length);
  });

  it("donne au quiz de démonstration un exemple de chaque type de question", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);

    const types = new Set(stores.questions.filter((q) => QUIZ_DEMO.some((d) => d.enonce === q.enonce)).map((q) => q.type));
    expect([...types].sort()).toEqual(["QCM", "REPONSE_COURTE", "VRAI_FAUX"]);
  });

  it("publie la leçon de démonstration avec ses sections rendues", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);

    const demo = stores.versions.find((v) => v.titre === LECON_DEMO.titre);
    expect(demo?.sections).toEqual(
      expect.arrayContaining([expect.objectContaining({ titre: "Le théorème" })]),
    );
  });

  it("ne republie rien au second passage", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);
    const versionsApresPremierPassage = stores.versions.length;
    const questionsApresPremierPassage = stores.questions.length;
    await seedAll(prisma);

    expect(stores.versions).toHaveLength(versionsApresPremierPassage);
    expect(stores.questions).toHaveLength(questionsApresPremierPassage);
  });

  it("installe la liste de départ du filtre du forum, sans doublon au second passage", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);
    await seedAll(prisma);

    expect([...stores.termes].sort()).toEqual([...TERMES_INITIAUX].sort());
  });

  it("installe les épreuves du BFEM et deux examens blancs de démonstration, sans doublon", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);
    await seedAll(prisma);

    expect(stores.epreuves.map((e) => e.code)).toEqual(EPREUVES_INITIALES.map((e) => e.code));
    expect(stores.examens.map((e) => [e.slug, e.premium])).toEqual([
      ["bfem-maths-examen-blanc-1", false],
      ["bfem-maths-examen-blanc-2", true],
    ]);
  });

  it("installe les offres Premium aux prix provisoires, sans doublon", async () => {
    const { prisma, stores } = createMockPrisma();

    await seedAll(prisma);
    await seedAll(prisma);

    expect(stores.plans.map((p) => [p.code, p.prixFcfa, p.aConfirmer])).toEqual([
      ["PREMIUM_MENSUEL", 1500, true],
      ["PREMIUM_ANNUEL", 15000, true],
    ]);
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
