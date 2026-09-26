import { describe, expect, it } from "vitest";
import type { QuestionCorrigible } from "./correction";
import { versQuestionPublique } from "./quiz-public";

const questions: QuestionCorrigible[] = [
  {
    id: "q1",
    type: "QCM",
    enonce: "Quel côté est l'hypoténuse ?",
    // Un choix mal formé en base, avec un indicateur de bonne réponse : il ne doit jamais sortir.
    choix: [
      { id: "a", texte: "[AB]" },
      { id: "b", texte: "[BC]", correct: true } as unknown as { id: string; texte: string },
    ],
    reponseCorrecte: ["b"],
    bareme: 1,
    explication: "Le côté opposé à l'angle droit.",
  },
  {
    id: "q2",
    type: "VRAI_FAUX",
    enonce: "L'hypoténuse est le plus petit côté.",
    choix: null,
    reponseCorrecte: false,
    bareme: 1,
    explication: "C'est le plus grand.",
  },
  {
    id: "q3",
    type: "REPONSE_COURTE",
    enonce: "Comment s'appelle ce côté ?",
    choix: null,
    reponseCorrecte: ["hypoténuse", "l'hypoténuse"],
    bareme: 2,
    explication: "Vocabulaire du triangle rectangle.",
  },
];

function toutesLesCles(valeur: unknown): string[] {
  if (Array.isArray(valeur)) return valeur.flatMap(toutesLesCles);
  if (valeur && typeof valeur === "object") {
    return Object.entries(valeur).flatMap(([cle, v]) => [cle, ...toutesLesCles(v)]);
  }
  return [];
}

describe("payload public d'un quiz", () => {
  const publiques = questions.map(versQuestionPublique);

  it("ne contient aucun champ de correction", () => {
    const cles = toutesLesCles(publiques);
    expect(cles.filter((cle) => /correct|explication|reponse/i.test(cle))).toEqual([]);
  });

  it("ne laisse fuiter ni la bonne réponse d'une réponse courte, ni les explications", () => {
    const json = JSON.stringify(publiques);
    expect(json).not.toContain("hypoténuse\"");
    expect(json).not.toContain("plus grand");
    expect(json).not.toContain("opposé");
  });

  it("garde ce qu'il faut pour répondre : énoncé, barème, choix et mode multiple", () => {
    expect(publiques[0]).toEqual({
      id: "q1",
      type: "QCM",
      enonce: "Quel côté est l'hypoténuse ?",
      bareme: 1,
      choix: [
        { id: "a", texte: "[AB]" },
        { id: "b", texte: "[BC]" },
      ],
      multiple: false,
    });
    expect(publiques[1]).toEqual({ id: "q2", type: "VRAI_FAUX", enonce: "L'hypoténuse est le plus petit côté.", bareme: 1 });
  });

  it("indique quand plusieurs réponses sont possibles", () => {
    const multiple = versQuestionPublique({ ...questions[0]!, reponseCorrecte: ["a", "b"] });
    expect(multiple.multiple).toBe(true);
  });
});
