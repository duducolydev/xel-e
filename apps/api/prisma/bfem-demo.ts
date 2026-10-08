import { Prisma, type PrismaClient } from "@prisma/client";
import type { QuizBrouillon } from "@xel-e/shared";
import { EPREUVES_INITIALES } from "../src/bfem/epreuves-initiales";
import { versDonneesQuestion } from "../src/studio/quiz-brouillon";

const choix = (textes: string[], bonne: number) => textes.map((texte, i) => ({ id: "abcd"[i]!, texte, correct: i === bonne }));

// Examen blanc de démonstration, au format de l'épreuve de mathématiques du BFEM (3 exercices, sur 20).
// À faire relire (validation de la Phase 9) : DOCS/examen-blanc-maths.md reprend ce sujet et son corrigé.
export const EXAMEN_MATHS_1 = {
  slug: "bfem-maths-examen-blanc-1",
  titre: "Examen blanc BFEM n°1 — Mathématiques",
  premium: false,
  consignes:
    "Le sujet comporte trois exercices notés sur 20 points.\n" +
    "Calculatrice non programmable autorisée. Réponds dans chaque champ par un nombre (décimal avec une virgule, " +
    "ou fraction irréductible quand c'est demandé) ; l'unité est facultative.\n" +
    "Tes réponses sont enregistrées au fur et à mesure. À la fin du temps, ta copie est rendue automatiquement.",
  questions: [
    // Exercice 1 — Activités numériques (6 points)
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 1. a) Calcule A = 3/4 − 2/3 × 3/8 et donne le résultat sous forme de fraction irréductible.",
      bareme: 1,
      explication: "2/3 × 3/8 = 6/24 = 1/4, donc A = 3/4 − 1/4 = 2/4 = 1/2.",
      reponsesAcceptees: ["1/2", "0,5"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 1. b) On pose B = √50 − 3√2 + √8. B s'écrit a√2 : quelle est la valeur de a ?",
      bareme: 1,
      explication: "√50 = 5√2 et √8 = 2√2, donc B = 5√2 − 3√2 + 2√2 = 4√2 : a = 4.",
      reponsesAcceptees: ["4"],
    },
    {
      type: "QCM",
      enonce: "Exercice 1. c) Le développement de (2x − 3)² est :",
      bareme: 1,
      explication: "(a − b)² = a² − 2ab + b² avec a = 2x et b = 3 : 4x² − 12x + 9.",
      choix: choix(["4x² − 9", "4x² − 12x + 9", "4x² + 12x + 9", "2x² − 12x + 9"], 1),
    },
    {
      type: "QCM",
      enonce: "Exercice 1. d) Une factorisation de 9x² − 25 est :",
      bareme: 1,
      explication: "9x² − 25 = (3x)² − 5² = (3x − 5)(3x + 5) (identité a² − b²).",
      choix: choix(["(3x − 5)²", "(3x − 5)(3x + 5)", "(9x − 5)(x + 5)", "3(3x² − 25)"], 1),
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 1. e) Résous l'équation 3x − 7 = 2x + 5. Donne la valeur de x.",
      bareme: 2,
      explication: "3x − 2x = 5 + 7, donc x = 12.",
      reponsesAcceptees: ["12", "x = 12", "x=12"],
    },
    // Exercice 2 — Système et fonction affine (6 points)
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 2. On considère le système { x + y = 11 ; 2x − y = 7 }. a) Donne la valeur de x.",
      bareme: 1,
      explication: "En additionnant les deux équations : 3x = 18, donc x = 6.",
      reponsesAcceptees: ["6", "x = 6", "x=6"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 2. b) Donne la valeur de y.",
      bareme: 1,
      explication: "y = 11 − x = 11 − 6 = 5.",
      reponsesAcceptees: ["5", "y = 5", "y=5"],
    },
    {
      type: "VRAI_FAUX",
      enonce: "Exercice 2. c) Soit f la fonction affine définie par f(x) = −2x + 3. Vrai ou faux : f est croissante.",
      bareme: 1,
      explication: "Le coefficient directeur −2 est négatif : f est décroissante.",
      reponse: false,
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 2. d) Calcule f(4).",
      bareme: 1,
      explication: "f(4) = −2 × 4 + 3 = −8 + 3 = −5.",
      reponsesAcceptees: ["-5", "−5"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 2. e) Quel nombre a pour image 7 par f ?",
      bareme: 2,
      explication: "−2x + 3 = 7 donne −2x = 4, donc x = −2.",
      reponsesAcceptees: ["-2", "−2", "x = -2", "x=-2"],
    },
    // Exercice 3 — Activités géométriques (8 points)
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 3. ABC est un triangle rectangle en A avec AB = 6 cm et AC = 8 cm. a) Calcule BC (en cm).",
      bareme: 2,
      explication: "Théorème de Pythagore : BC² = AB² + AC² = 36 + 64 = 100, donc BC = 10 cm.",
      reponsesAcceptees: ["10", "10 cm", "10cm"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 3. b) Calcule cos(ABC), le cosinus de l'angle de sommet B (valeur décimale).",
      bareme: 1,
      explication: "cos(ABC) = côté adjacent / hypoténuse = AB / BC = 6 / 10 = 0,6.",
      reponsesAcceptees: ["0,6", "3/5"],
    },
    {
      type: "REPONSE_COURTE",
      enonce:
        "Exercice 3. c) M est le point de [AB] tel que AM = 3 cm. La parallèle à (BC) passant par M coupe [AC] en N. Calcule AN (en cm).",
      bareme: 2,
      explication: "(MN) // (BC) : d'après le théorème de Thalès, AM/AB = AN/AC, soit 3/6 = AN/8, donc AN = 4 cm.",
      reponsesAcceptees: ["4", "4 cm", "4cm"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Exercice 3. d) Calcule MN (en cm).",
      bareme: 1,
      explication: "AM/AB = MN/BC, soit 3/6 = MN/10, donc MN = 5 cm.",
      reponsesAcceptees: ["5", "5 cm", "5cm"],
    },
    {
      type: "QCM",
      enonce: "Exercice 3. e) L'aire du triangle ABC est :",
      bareme: 1,
      explication: "Aire = (AB × AC) / 2 = (6 × 8) / 2 = 24 cm².",
      choix: choix(["48 cm²", "24 cm²", "14 cm²", "30 cm²"], 1),
    },
    {
      type: "VRAI_FAUX",
      enonce: "Exercice 3. f) Vrai ou faux : le centre du cercle circonscrit au triangle ABC est le milieu de [BC].",
      bareme: 1,
      explication: "Dans un triangle rectangle, le centre du cercle circonscrit est le milieu de l'hypoténuse [BC].",
      reponse: true,
    },
  ] satisfies QuizBrouillon,
};

// Second examen, premium : montre l'état « réservé aux abonnés » tant que les paiements n'existent pas.
export const EXAMEN_MATHS_2 = {
  slug: "bfem-maths-examen-blanc-2",
  titre: "Examen blanc BFEM n°2 — Mathématiques",
  premium: true,
  consignes: "Cinq questions notées sur 20 points. Calculatrice non programmable autorisée.",
  questions: [
    {
      type: "REPONSE_COURTE",
      enonce: "1. Calcule C = 5/6 + 1/3 ÷ 2.",
      bareme: 4,
      explication: "1/3 ÷ 2 = 1/6, donc C = 5/6 + 1/6 = 1.",
      reponsesAcceptees: ["1"],
    },
    {
      type: "QCM",
      enonce: "2. Le produit (x + 2)(x − 2) est égal à :",
      bareme: 4,
      explication: "(a + b)(a − b) = a² − b² : x² − 4.",
      choix: choix(["x² − 4", "x² + 4", "x² − 4x + 4", "x² − 2"], 0),
    },
    {
      type: "REPONSE_COURTE",
      enonce: "3. Résous l'inéquation 2x + 3 < 11 (écris la solution sous la forme x < …).",
      bareme: 4,
      explication: "2x < 8, donc x < 4.",
      reponsesAcceptees: ["x < 4", "x<4"],
    },
    {
      type: "REPONSE_COURTE",
      enonce: "4. Le périmètre d'un cercle de rayon 5 cm s'écrit a × π cm. Quelle est la valeur de a ?",
      bareme: 4,
      explication: "P = 2 × π × r = 2 × π × 5 = 10π.",
      reponsesAcceptees: ["10"],
    },
    {
      type: "VRAI_FAUX",
      enonce: "5. Vrai ou faux : dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés.",
      bareme: 4,
      explication: "C'est l'énoncé du théorème de Pythagore.",
      reponse: true,
    },
  ] satisfies QuizBrouillon,
};

// Épreuves du BFEM (valeurs provisoires, jamais écrasées si l'administration les a modifiées) et
// examens blancs de démonstration.
export async function seedBfem(prisma: PrismaClient): Promise<void> {
  for (const [index, epreuve] of EPREUVES_INITIALES.entries()) {
    await prisma.epreuveBfem.upsert({
      where: { code: epreuve.code },
      update: {},
      create: { ...epreuve, ordre: index + 1, aVerifier: true },
    });
  }
  const maths = await prisma.epreuveBfem.findUniqueOrThrow({ where: { code: "MATHS" } });
  for (const examen of [EXAMEN_MATHS_1, EXAMEN_MATHS_2]) {
    if (await prisma.examenBlanc.findUnique({ where: { slug: examen.slug } })) continue;
    await prisma.examenBlanc.create({
      data: {
        slug: examen.slug,
        titre: examen.titre,
        consignes: examen.consignes,
        premium: examen.premium,
        publie: true,
        epreuveId: maths.id,
        questions: {
          create: examen.questions.map((question, index) => {
            const donnees = versDonneesQuestion({ ...question, explication: question.explication }, index + 1);
            return { ...donnees, choix: donnees.choix ?? Prisma.DbNull };
          }),
        },
      },
    });
  }
}
