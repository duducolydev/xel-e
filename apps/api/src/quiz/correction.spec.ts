import { describe, expect, it } from "vitest";
import {
  corrigerQuestion,
  corrigerTentative,
  normaliserReponseCourte,
  type QuestionCorrigible,
} from "./correction";

const choix = [
  { id: "a", texte: "A" },
  { id: "b", texte: "B" },
  { id: "c", texte: "C" },
  { id: "d", texte: "D" },
];

function question(surcharges: Partial<QuestionCorrigible>): QuestionCorrigible {
  return {
    id: "q",
    type: "QCM",
    enonce: "Énoncé",
    choix,
    reponseCorrecte: ["a"],
    bareme: 2,
    explication: null,
    ...surcharges,
  };
}

describe("QCM à une seule bonne réponse", () => {
  const q = question({ reponseCorrecte: ["b"] });

  it("donne tous les points pour la bonne réponse", () => {
    expect(corrigerQuestion(q, ["b"])).toEqual({ statut: "correcte", pointsObtenus: 2 });
  });

  it("ne donne rien pour une mauvaise réponse", () => {
    expect(corrigerQuestion(q, ["a"])).toEqual({ statut: "incorrecte", pointsObtenus: 0 });
  });
});

describe("QCM à plusieurs bonnes réponses : proportionnel avec pénalité", () => {
  const q = question({ reponseCorrecte: ["a", "c"], bareme: 2 });

  it("toutes les bonnes et aucune mauvaise ⇒ tous les points", () => {
    expect(corrigerQuestion(q, ["c", "a"])).toEqual({ statut: "correcte", pointsObtenus: 2 });
  });

  it("une bonne sur deux ⇒ moitié des points", () => {
    expect(corrigerQuestion(q, ["a"])).toEqual({ statut: "partielle", pointsObtenus: 1 });
  });

  it("une bonne et une mauvaise ⇒ 0 (la mauvaise annule la bonne)", () => {
    expect(corrigerQuestion(q, ["a", "b"])).toEqual({ statut: "incorrecte", pointsObtenus: 0 });
  });

  it("tout cocher ne rapporte rien", () => {
    expect(corrigerQuestion(q, ["a", "b", "c", "d"])).toEqual({ statut: "incorrecte", pointsObtenus: 0 });
  });

  it("jamais de points négatifs", () => {
    expect(corrigerQuestion(q, ["b", "d"]).pointsObtenus).toBe(0);
  });

  it("arrondit les fractions au centième", () => {
    const trois = question({ reponseCorrecte: ["a", "b", "c"], bareme: 1 });
    expect(corrigerQuestion(trois, ["a"]).pointsObtenus).toBe(0.33);
  });

  it("ignore les doublons et les identifiants inconnus", () => {
    expect(corrigerQuestion(q, ["a", "a", "z"])).toEqual({ statut: "partielle", pointsObtenus: 1 });
  });
});

describe("vrai / faux", () => {
  const q = question({ type: "VRAI_FAUX", choix: null, reponseCorrecte: false, bareme: 1 });

  it("compare la valeur booléenne", () => {
    expect(corrigerQuestion(q, false)).toEqual({ statut: "correcte", pointsObtenus: 1 });
    expect(corrigerQuestion(q, true)).toEqual({ statut: "incorrecte", pointsObtenus: 0 });
  });
});

describe("réponse courte", () => {
  const q = question({
    type: "REPONSE_COURTE",
    choix: null,
    reponseCorrecte: ["Photosynthèse", "la photosynthèse"],
    bareme: 1,
  });

  it("« Photosynthèse » = « photosynthese » (casse et accents ignorés)", () => {
    expect(corrigerQuestion(q, "photosynthese")).toEqual({ statut: "correcte", pointsObtenus: 1 });
    expect(corrigerQuestion(q, "PHOTOSYNTHÈSE")).toEqual({ statut: "correcte", pointsObtenus: 1 });
  });

  it("ignore les espaces superflus et la ponctuation finale", () => {
    expect(corrigerQuestion(q, "  La   photosynthèse. ")).toEqual({ statut: "correcte", pointsObtenus: 1 });
  });

  it("refuse une autre réponse", () => {
    expect(corrigerQuestion(q, "respiration")).toEqual({ statut: "incorrecte", pointsObtenus: 0 });
  });

  it("accepte la virgule ou le point décimal", () => {
    const nombre = question({ type: "REPONSE_COURTE", choix: null, reponseCorrecte: ["0,5"], bareme: 1 });
    expect(corrigerQuestion(nombre, "0.5").statut).toBe("correcte");
  });
});

describe("absence de réponse", () => {
  it.each([
    ["QCM", question({}), []],
    ["QCM", question({}), null],
    ["VRAI_FAUX", question({ type: "VRAI_FAUX", choix: null, reponseCorrecte: true }), null],
    ["REPONSE_COURTE", question({ type: "REPONSE_COURTE", choix: null, reponseCorrecte: ["x"] }), "   "],
  ])("%s sans réponse ⇒ 0 point, statut « sans-reponse »", (_type, q, reponse) => {
    expect(corrigerQuestion(q, reponse)).toEqual({ statut: "sans-reponse", pointsObtenus: 0 });
  });

  it("une réponse d'un type inattendu compte comme une absence de réponse", () => {
    expect(corrigerQuestion(question({}), true)).toEqual({ statut: "sans-reponse", pointsObtenus: 0 });
  });
});

describe("normalisation des réponses courtes", () => {
  it.each([
    ["Photosynthèse", "photosynthese"],
    ["  Hypoténuse  ", "hypotenuse"],
    ["l’hypoténuse", "l'hypotenuse"],
    ["5,0 cm", "5.0 cm"],
    ["Oui !", "oui"],
  ])("%s → %s", (brut, attendu) => {
    expect(normaliserReponseCourte(brut)).toBe(attendu);
  });
});

describe("correction d'une tentative complète", () => {
  const questions = [
    question({ id: "q1", reponseCorrecte: ["a"], bareme: 2 }),
    question({ id: "q2", type: "VRAI_FAUX", choix: null, reponseCorrecte: true, bareme: 1 }),
    question({ id: "q3", type: "REPONSE_COURTE", choix: null, reponseCorrecte: ["cinq"], bareme: 1, explication: "5 = cinq" }),
  ];

  it("additionne les points et calcule le pourcentage", () => {
    const resultat = corrigerTentative(questions, { q1: ["a"], q2: false, q3: "Cinq" });

    expect(resultat).toMatchObject({ pointsObtenus: 3, pointsTotal: 4, score: 75 });
    expect(resultat.details.map((d) => d.statut)).toEqual(["correcte", "incorrecte", "correcte"]);
  });

  it("aucune réponse ⇒ 0 %", () => {
    expect(corrigerTentative(questions, {})).toMatchObject({ pointsObtenus: 0, pointsTotal: 4, score: 0 });
  });

  it("donne pour chaque question la bonne réponse et l'explication", () => {
    const { details } = corrigerTentative(questions, { q3: "six" });

    expect(details[2]).toMatchObject({
      reponseDonnee: "six",
      bonneReponse: ["cinq"],
      explication: "5 = cinq",
      bareme: 1,
    });
    expect(details[1]?.reponseDonnee).toBeNull();
  });

  it("arrondit le score au dixième", () => {
    const trois = [question({ id: "x", bareme: 3 }), question({ id: "y", bareme: 3 }), question({ id: "z", bareme: 3 })];
    expect(corrigerTentative(trois, { x: ["a"] }).score).toBe(33.3);
  });

  it("un quiz sans point ne divise pas par zéro", () => {
    expect(corrigerTentative([], {}).score).toBe(0);
  });
});
