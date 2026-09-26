// Contenus de démonstration (développement uniquement).

export const CHAPITRE_DEMO = { niveau: "4e", matiere: "Maths", ordre: 1, titre: "Le triangle rectangle" } as const;

export const LECON_DEMO = {
  ordre: 1,
  slug: "le-theoreme-de-pythagore",
  titre: "Le théorème de Pythagore",
  contenu: `Le théorème de Pythagore relie les longueurs des trois côtés d'un triangle rectangle. Il permet de calculer une longueur inconnue ou de vérifier qu'un triangle est rectangle.

## Vocabulaire

Dans un triangle rectangle, le **côté opposé à l'angle droit** s'appelle l'**hypoténuse**. C'est toujours le plus long des trois côtés.

- Dans le triangle $ABC$ rectangle en $A$, l'hypoténuse est $[BC]$.
- Les deux autres côtés, $[AB]$ et $[AC]$, forment l'angle droit.

## Le théorème

> Si un triangle est rectangle, alors le carré de la longueur de l'hypoténuse est égal à la somme des carrés des longueurs des deux autres côtés.

Pour le triangle $ABC$ rectangle en $A$ :

$$BC^2 = AB^2 + AC^2$$

## Exemple résolu

Le triangle $ABC$ est rectangle en $A$, avec $AB = 3$ cm et $AC = 4$ cm. Calculons $BC$.

$$BC^2 = 3^2 + 4^2 = 9 + 16 = 25$$

Donc $BC = \\sqrt{25} = 5$ cm.

## À retenir

| Je connais | Je cherche | J'utilise |
|---|---|---|
| les deux côtés de l'angle droit | l'hypoténuse | $BC^2 = AB^2 + AC^2$ |
| l'hypoténuse et un côté | l'autre côté | $AB^2 = BC^2 - AC^2$ |
`,
} as const;

export function contenuGenerique(titreLecon: string, titreChapitre: string, nomMatiere: string): string {
  return `Cette leçon de démonstration présente « ${titreLecon} » (${nomMatiere}, ${titreChapitre}).

## Objectifs

- Comprendre la notion principale de la leçon.
- Savoir l'appliquer sur un exemple simple.

## Cours

Un exemple de formule : $$\\frac{a}{b} \\times \\frac{c}{d} = \\frac{a \\times c}{b \\times d}$$

## À retenir

Relis le cours puis entraîne-toi avec le quiz de la leçon.
`;
}

export interface QuestionDemo {
  type: "QCM" | "VRAI_FAUX" | "REPONSE_COURTE";
  enonce: string;
  choix?: { id: string; texte: string }[];
  reponseCorrecte: string[] | boolean;
  bareme: number;
  explication: string;
}

// Un exemple de chaque type de question, pour la revue du moteur de quiz.
export const QUIZ_DEMO: QuestionDemo[] = [
  {
    type: "QCM",
    enonce: "Le triangle ABC est rectangle en A. Quelle est son hypoténuse ?",
    choix: [
      { id: "a", texte: "[AB]" },
      { id: "b", texte: "[AC]" },
      { id: "c", texte: "[BC]" },
    ],
    reponseCorrecte: ["c"],
    bareme: 1,
    explication: "L'hypoténuse est le côté opposé à l'angle droit : ici l'angle droit est en A, donc c'est [BC].",
  },
  {
    type: "QCM",
    enonce: "Le triangle ABC est rectangle en A. Quelles égalités sont vraies ?",
    choix: [
      { id: "a", texte: "BC² = AB² + AC²" },
      { id: "b", texte: "AB² = BC² − AC²" },
      { id: "c", texte: "AC² = AB² + BC²" },
      { id: "d", texte: "BC = AB + AC" },
    ],
    reponseCorrecte: ["a", "b"],
    bareme: 2,
    explication:
      "BC² = AB² + AC² est le théorème ; en soustrayant AC² des deux côtés on obtient AB² = BC² − AC². " +
      "Le théorème porte sur les carrés des longueurs, pas sur les longueurs elles-mêmes.",
  },
  {
    type: "VRAI_FAUX",
    enonce: "Dans un triangle rectangle, l'hypoténuse est le plus petit des trois côtés.",
    reponseCorrecte: false,
    bareme: 1,
    explication: "C'est l'inverse : l'hypoténuse est toujours le plus long des trois côtés.",
  },
  {
    type: "REPONSE_COURTE",
    enonce: "ABC est rectangle en A, avec AB = 6 cm et AC = 8 cm. Combien mesure BC, en cm ?",
    reponseCorrecte: ["10", "10 cm", "10cm"],
    bareme: 2,
    explication: "BC² = 6² + 8² = 36 + 64 = 100, donc BC = √100 = 10 cm.",
  },
  {
    type: "REPONSE_COURTE",
    enonce: "Comment appelle-t-on le côté opposé à l'angle droit ?",
    reponseCorrecte: ["hypoténuse", "l'hypoténuse"],
    bareme: 1,
    explication: "C'est l'hypoténuse (les majuscules et les accents ne comptent pas dans la réponse).",
  },
];

export function questionsGeneriques(titreLecon: string): QuestionDemo[] {
  return [
    {
      type: "QCM",
      enonce: `Question de démonstration (« ${titreLecon} ») : combien font 2 + 3 ?`,
      choix: [
        { id: "a", texte: "4" },
        { id: "b", texte: "5" },
        { id: "c", texte: "6" },
      ],
      reponseCorrecte: ["b"],
      bareme: 1,
      explication: "2 + 3 = 5.",
    },
    {
      type: "VRAI_FAUX",
      enonce: "Un triangle a trois côtés.",
      reponseCorrecte: true,
      bareme: 1,
      explication: "Par définition, un triangle a trois côtés et trois angles.",
    },
    {
      type: "REPONSE_COURTE",
      enonce: "Combien de côtés a un carré ? (en chiffres)",
      reponseCorrecte: ["4", "quatre"],
      bareme: 1,
      explication: "Un carré a quatre côtés de même longueur.",
    },
  ];
}
