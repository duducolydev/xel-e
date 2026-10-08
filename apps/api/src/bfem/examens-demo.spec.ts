import type { ChoixPublic, QuestionBrouillon } from "@xel-e/shared";
import { quizBrouillonSchema } from "@xel-e/shared";
import { describe, expect, it } from "vitest";
import { EXAMEN_MATHS_1, EXAMEN_MATHS_2 } from "../../prisma/bfem-demo";
import { corrigerTentative, type QuestionCorrigible } from "../quiz/correction";
import { versDonneesQuestion } from "../studio/quiz-brouillon";

function corrigible(question: QuestionBrouillon, index: number): QuestionCorrigible {
  const donnees = versDonneesQuestion(question, index + 1);
  return {
    id: `q${index + 1}`,
    type: donnees.type,
    enonce: donnees.enonce,
    choix: (donnees.choix as ChoixPublic[] | undefined) ?? null,
    reponseCorrecte: donnees.reponseCorrecte,
    bareme: donnees.bareme,
    explication: donnees.explication,
  };
}

// La bonne réponse attendue d'une question, telle qu'un élève la saisirait.
function bonneReponse(question: QuestionBrouillon) {
  if (question.type === "QCM") return question.choix.filter((c) => c.correct).map((c) => c.id);
  if (question.type === "VRAI_FAUX") return question.reponse;
  return question.reponsesAcceptees[0]!;
}

describe.each([
  ["n°1 (gratuit)", EXAMEN_MATHS_1],
  ["n°2 (premium)", EXAMEN_MATHS_2],
])("examen blanc de démonstration %s", (_nom, examen) => {
  const questions = examen.questions as QuestionBrouillon[];

  it("respecte le format de l'éditeur (validable par l'API)", () => {
    expect(quizBrouillonSchema.safeParse(questions).success).toBe(true);
  });

  it("est noté sur 20 points, comme au BFEM", () => {
    expect(questions.reduce((total, q) => total + q.bareme, 0)).toBe(20);
  });

  it("chaque bonne réponse rapporte tous ses points (corrigé cohérent)", () => {
    const reponses = Object.fromEntries(questions.map((q, i) => [`q${i + 1}`, bonneReponse(q)]));
    const resultat = corrigerTentative(questions.map(corrigible), reponses);

    expect(resultat.details.filter((d) => d.statut !== "correcte").map((d) => d.enonce)).toEqual([]);
    expect(resultat.score).toBe(100);
  });

  it("chaque question a une explication pour le corrigé", () => {
    expect(questions.filter((q) => !q.explication)).toEqual([]);
  });
});

describe("réponses courtes acceptées sous plusieurs formes", () => {
  const questions = EXAMEN_MATHS_1.questions as QuestionBrouillon[];
  const corrigibles = questions.map(corrigible);
  const corriger = (index: number, reponse: string) => corrigerTentative([corrigibles[index]!], { [`q${index + 1}`]: reponse }).score;

  it("virgule ou point décimal, unité facultative, signe moins typographique", () => {
    expect(corriger(11, "0.6")).toBe(100);
    expect(corriger(11, "3/5")).toBe(100);
    expect(corriger(10, "10 CM")).toBe(100);
    expect(corriger(8, "−5")).toBe(100);
    expect(corriger(0, "0,5")).toBe(100);
  });

  it("une mauvaise réponse ne rapporte rien", () => {
    expect(corriger(10, "14")).toBe(0);
    expect(corriger(0, "2/4")).toBe(0);
  });
});
