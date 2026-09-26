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
