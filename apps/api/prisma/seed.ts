import { PrismaClient, Role } from "@prisma/client";

export const NIVEAUX_SEED = [
  { libelle: "6e", ordre: 1 },
  { libelle: "5e", ordre: 2 },
  { libelle: "4e", ordre: 3 },
  { libelle: "3e", ordre: 4 },
] as const;

export const MATIERES_SEED = ["Maths", "PC", "SVT"] as const;

export const CHAPITRES_PAR_MATIERE = 2;
export const LECONS_PAR_CHAPITRE = 3;

// Les comptes de démo n'ont pas de mot de passe réel : le hash argon2 et
// l'inscription arrivent en Phase 2 (Authentification).
const PLACEHOLDER_PASSWORD_HASH = "seed-placeholder-hash";

export const COMPTES_DEMO_SEED = [
  {
    email: "eleve.demo@xele.sn",
    role: Role.ELEVE,
    nomComplet: "Fatou Élève Démo",
    pseudonyme: "fatou_demo",
  },
  {
    email: "prof.demo@xele.sn",
    role: Role.PROFESSEUR,
    nomComplet: "Moussa Professeur Démo",
    pseudonyme: null,
  },
  {
    email: "parent.demo@xele.sn",
    role: Role.PARENT,
    nomComplet: "Awa Parent Démo",
    pseudonyme: null,
  },
  {
    email: "admin.demo@xele.sn",
    role: Role.ADMIN,
    nomComplet: "Admin Démo",
    pseudonyme: null,
  },
] as const;

export async function seedNiveaux(prisma: PrismaClient) {
  return Promise.all(
    NIVEAUX_SEED.map((niveau) =>
      prisma.niveau.upsert({
        where: { libelle: niveau.libelle },
        update: {},
        create: niveau,
      }),
    ),
  );
}

export async function seedMatieres(prisma: PrismaClient) {
  return Promise.all(
    MATIERES_SEED.map((libelle) =>
      prisma.matiere.upsert({
        where: { libelle },
        update: {},
        create: { libelle },
      }),
    ),
  );
}

export async function seedChapitresEtLecons(
  prisma: PrismaClient,
  niveaux: { id: string }[],
  matieres: { id: string }[],
) {
  for (const niveau of niveaux) {
    for (const matiere of matieres) {
      for (let c = 1; c <= CHAPITRES_PAR_MATIERE; c += 1) {
        const chapitre = await prisma.chapitre.upsert({
          where: {
            niveauId_matiereId_ordre: {
              niveauId: niveau.id,
              matiereId: matiere.id,
              ordre: c,
            },
          },
          update: {},
          create: {
            niveauId: niveau.id,
            matiereId: matiere.id,
            ordre: c,
            titre: `Chapitre ${c}`,
          },
        });

        for (let l = 1; l <= LECONS_PAR_CHAPITRE; l += 1) {
          const lecon = await prisma.lecon.upsert({
            where: {
              chapitreId_ordre: {
                chapitreId: chapitre.id,
                ordre: l,
              },
            },
            update: {},
            create: {
              chapitreId: chapitre.id,
              ordre: l,
              titre: `Leçon ${l}`,
            },
          });

          await prisma.quiz.upsert({
            where: { leconId: lecon.id },
            update: {},
            create: { leconId: lecon.id },
          });
        }
      }
    }
  }
}

export async function seedComptesDemo(prisma: PrismaClient) {
  return Promise.all(
    COMPTES_DEMO_SEED.map((compte) =>
      prisma.user.upsert({
        where: { email: compte.email },
        update: {},
        create: { ...compte, motDePasseHash: PLACEHOLDER_PASSWORD_HASH },
      }),
    ),
  );
}

export async function seedAll(prisma: PrismaClient) {
  const niveaux = await seedNiveaux(prisma);
  const matieres = await seedMatieres(prisma);
  await seedChapitresEtLecons(prisma, niveaux, matieres);
  await seedComptesDemo(prisma);
}
