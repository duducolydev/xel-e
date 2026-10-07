import { Prisma, PrismaClient, Role, StatutCompte, StatutLecon } from "@prisma/client";
import { INFOS_MATIERES, type Matiere } from "@xel-e/shared";
import { hasherMotDePasse } from "../src/auth/password";
import { rendreLecon } from "../src/contenus/rendu-markdown";
import { TERMES_INITIAUX } from "../src/forum/termes-initiaux";
import { CHAPITRE_DEMO, contenuGenerique, LECON_DEMO, QUIZ_DEMO, questionsGeneriques } from "./contenus-demo";

export { LECON_DEMO, QUIZ_DEMO };

export const NIVEAUX_SEED = [
  { libelle: "6e", ordre: 1 },
  { libelle: "5e", ordre: 2 },
  { libelle: "4e", ordre: 3 },
  { libelle: "3e", ordre: 4 },
] as const;

export const MATIERES_SEED = ["Maths", "PC", "SVT"] as const;

export const CHAPITRES_PAR_MATIERE = 2;
export const LECONS_PAR_CHAPITRE = 3;

// Développement uniquement : ces comptes ne doivent jamais exister en production.
export const MOT_DE_PASSE_DEMO = "XeleDemo2026";

const CONFIRME_LE = new Date("2026-01-01T00:00:00Z");

export const COMPTES_DEMO_SEED = [
  {
    email: "eleve.demo@xele.sn",
    role: Role.ELEVE,
    nomComplet: "Fatou Élève Démo",
    pseudonyme: "fatou_demo",
    naissanceMois: 1,
    naissanceAnnee: 2010,
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

interface Reference {
  id: string;
  libelle: string;
}

export async function seedChapitresEtLecons(
  prisma: PrismaClient,
  niveaux: Reference[],
  matieres: Reference[],
) {
  for (const niveau of niveaux) {
    for (const matiere of matieres) {
      const info = INFOS_MATIERES[matiere.libelle as Matiere];
      for (let c = 1; c <= CHAPITRES_PAR_MATIERE; c += 1) {
        const estChapitreDemo =
          niveau.libelle === CHAPITRE_DEMO.niveau && matiere.libelle === CHAPITRE_DEMO.matiere && c === CHAPITRE_DEMO.ordre;
        const titreChapitre = estChapitreDemo ? CHAPITRE_DEMO.titre : `Chapitre ${c}`;
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
            titre: titreChapitre,
          },
        });

        for (let l = 1; l <= LECONS_PAR_CHAPITRE; l += 1) {
          const estLeconDemo = estChapitreDemo && l === LECON_DEMO.ordre;
          const titre = estLeconDemo ? LECON_DEMO.titre : `Leçon ${l}`;
          const slug = estLeconDemo
            ? LECON_DEMO.slug
            : `${niveau.libelle}-${info.slug}-chapitre-${c}-lecon-${l}`;
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
              titre,
              slug,
              contenu: estLeconDemo ? LECON_DEMO.contenu : contenuGenerique(titre, titreChapitre, info.nom),
            },
          });

          const quiz = await prisma.quiz.upsert({
            where: { leconId: lecon.id },
            update: {},
            create: { leconId: lecon.id },
          });
          if ((await prisma.question.count({ where: { quizId: quiz.id } })) === 0) {
            const questions = estLeconDemo ? QUIZ_DEMO : questionsGeneriques(titre);
            await prisma.question.createMany({
              data: questions.map((question, index) => ({ ...question, quizId: quiz.id, ordre: index + 1 })),
            });
          }
        }
      }
    }
  }
}

// Les comptes de démo sont remis dans un état connu à chaque seed (mot de passe, email confirmé, actif).
export async function seedComptesDemo(prisma: PrismaClient, niveauEleveId: string) {
  const etatConnu = {
    motDePasseHash: await hasherMotDePasse(MOT_DE_PASSE_DEMO),
    emailConfirmeLe: CONFIRME_LE,
    statutCompte: StatutCompte.ACTIF,
  };
  return Promise.all(
    COMPTES_DEMO_SEED.map((compte) => {
      const niveauId = compte.role === Role.ELEVE ? niveauEleveId : null;
      return prisma.user.upsert({
        where: { email: compte.email },
        update: etatConnu,
        create: { ...compte, ...etatConnu, niveauId },
      });
    }),
  );
}

// Publie (version 1) les leçons de démo jamais publiées ; relancer le seed ne crée aucune version.
export async function seedPublication(prisma: PrismaClient, publieParId: string | null) {
  const aPublier = await prisma.lecon.findMany({ where: { version: 0, deletedAt: null } });
  for (const lecon of aPublier) {
    const contenu = lecon.contenu ?? "";
    const rendu = rendreLecon(contenu);
    const version = await prisma.versionLecon.create({
      data: {
        leconId: lecon.id,
        numero: 1,
        titre: lecon.titre,
        contenu,
        sections: rendu.sections as unknown as Prisma.InputJsonValue,
        resume: rendu.resume,
        publieParId,
      },
    });
    await prisma.lecon.update({
      where: { id: lecon.id },
      data: { statut: StatutLecon.PUBLIE, version: 1, versionPublieeId: version.id },
    });
  }
}

// Liste de départ du filtre du forum (également insérée par la migration « forum » en production).
export async function seedTermesInterdits(prisma: PrismaClient) {
  await prisma.termeInterdit.createMany({ data: TERMES_INITIAUX.map((terme) => ({ terme })), skipDuplicates: true });
}

export async function seedAll(prisma: PrismaClient) {
  const niveaux = await seedNiveaux(prisma);
  const matieres = await seedMatieres(prisma);
  await seedChapitresEtLecons(prisma, niveaux, matieres);
  const troisieme = niveaux.find((niveau) => niveau.libelle === "3e") ?? niveaux[0];
  if (!troisieme) throw new Error("Aucun niveau créé.");
  const comptes = await seedComptesDemo(prisma, troisieme.id);
  const admin = comptes.find((compte) => compte.role === Role.ADMIN);
  await seedPublication(prisma, admin?.id ?? null);
  await seedTermesInterdits(prisma);
}
