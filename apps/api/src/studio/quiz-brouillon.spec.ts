import { quizBrouillonSchema, type QuizBrouillon } from "@xel-e/shared";
import { describe, expect, it } from "vitest";
import { corrigerTentative } from "../quiz/correction";
import { planifierSynchronisation, versBrouillon, versDonneesQuestion, type QuestionEnLigne } from "./quiz-brouillon";

const ID_QCM = "0b6c4b1e-4a5e-4f7d-9d51-1f6f4e8e2a01";
const ID_VF = "0b6c4b1e-4a5e-4f7d-9d51-1f6f4e8e2a02";
const ID_RC = "0b6c4b1e-4a5e-4f7d-9d51-1f6f4e8e2a03";

const EN_LIGNE: QuestionEnLigne[] = [
  {
    id: ID_QCM,
    type: "QCM",
    enonce: "Quels nombres sont pairs ?",
    choix: [
      { id: "a", texte: "2" },
      { id: "b", texte: "3" },
      { id: "c", texte: "4" },
    ],
    reponseCorrecte: ["a", "c"],
    explication: "Divisibles par 2.",
    bareme: 2,
  },
  { id: ID_VF, type: "VRAI_FAUX", enonce: "0 est pair.", choix: null, reponseCorrecte: true, explication: null, bareme: 1 },
  {
    id: ID_RC,
    type: "REPONSE_COURTE",
    enonce: "Combien font 2 × 3 ?",
    choix: null,
    reponseCorrecte: ["6", "six"],
    explication: null,
    bareme: 1,
  },
];

describe("conversion quiz en ligne ⇄ éditeur", () => {
  it("porte les bonnes réponses sur chaque choix dans l'éditeur", () => {
    const brouillon = versBrouillon(EN_LIGNE);

    expect(brouillon).toEqual([
      {
        id: ID_QCM,
        type: "QCM",
        enonce: "Quels nombres sont pairs ?",
        bareme: 2,
        explication: "Divisibles par 2.",
        choix: [
          { id: "a", texte: "2", correct: true },
          { id: "b", texte: "3", correct: false },
          { id: "c", texte: "4", correct: true },
        ],
      },
      { id: ID_VF, type: "VRAI_FAUX", enonce: "0 est pair.", bareme: 1, explication: undefined, reponse: true },
      { id: ID_RC, type: "REPONSE_COURTE", enonce: "Combien font 2 × 3 ?", bareme: 1, explication: undefined, reponsesAcceptees: ["6", "six"] },
    ]);
    expect(quizBrouillonSchema.safeParse(brouillon).success).toBe(true);
  });

  it("aller-retour sans perte : le quiz converti se corrige comme l'original", () => {
    const retour = versBrouillon(EN_LIGNE).map((question, index) => ({
      id: EN_LIGNE[index]!.id,
      ...versDonneesQuestion(question, index + 1),
    }));
    const reponses = { [ID_QCM]: ["a", "b"], [ID_VF]: true, [ID_RC]: "Six" };
    const versCorrigible = (q: QuestionEnLigne | (typeof retour)[number]) => ({
      id: q.id,
      type: q.type,
      enonce: q.enonce,
      choix: (q.choix ?? null) as { id: string; texte: string }[] | null,
      reponseCorrecte: q.reponseCorrecte,
      bareme: q.bareme,
      explication: q.explication ?? null,
    });

    expect(corrigerTentative(retour.map(versCorrigible), reponses)).toEqual(corrigerTentative(EN_LIGNE.map(versCorrigible), reponses));
  });

  it("ne stocke jamais le drapeau « correct » dans les choix publics", () => {
    const donnees = versDonneesQuestion(versBrouillon(EN_LIGNE)[0]!, 1);

    expect(donnees.choix).toEqual([
      { id: "a", texte: "2" },
      { id: "b", texte: "3" },
      { id: "c", texte: "4" },
    ]);
    expect(donnees.reponseCorrecte).toEqual(["a", "c"]);
  });

  it("un QCM sans choix enregistrés reste lisible (liste vide)", () => {
    const [qcm] = versBrouillon([{ ...EN_LIGNE[0]!, choix: null, reponseCorrecte: "corrompu" }]);
    expect(qcm).toMatchObject({ type: "QCM", choix: [] });
  });
});

describe("synchronisation du quiz à la publication", () => {
  const brouillon: QuizBrouillon = versBrouillon(EN_LIGNE);

  it("modifie les questions conservées, crée les nouvelles, supprime les retirées, dans l'ordre de l'éditeur", () => {
    const nouvelle = { type: "VRAI_FAUX", enonce: "1 est pair.", bareme: 1, explication: undefined, reponse: false } as const;

    const plan = planifierSynchronisation([ID_QCM, ID_VF, ID_RC], [brouillon[2]!, nouvelle, brouillon[0]!]);

    expect(plan.aModifier.map((m) => [m.id, m.donnees.ordre])).toEqual([
      [ID_RC, 1],
      [ID_QCM, 3],
    ]);
    expect(plan.aCreer).toEqual([expect.objectContaining({ enonce: "1 est pair.", ordre: 2, reponseCorrecte: false })]);
    expect(plan.aSupprimer).toEqual([ID_VF]);
  });

  it("ignore un identifiant inconnu ou dupliqué (question recréée)", () => {
    const etrangere = { ...brouillon[1]!, id: "9b6c4b1e-4a5e-4f7d-9d51-1f6f4e8e2a09" };

    const plan = planifierSynchronisation([ID_QCM], [brouillon[0]!, brouillon[0]!, etrangere]);

    expect(plan.aModifier.map((m) => m.id)).toEqual([ID_QCM]);
    expect(plan.aCreer).toHaveLength(2);
    expect(plan.aSupprimer).toEqual([]);
  });

  it("un quiz vide supprime toutes les questions", () => {
    expect(planifierSynchronisation([ID_QCM, ID_VF], [])).toEqual({ aModifier: [], aCreer: [], aSupprimer: [ID_QCM, ID_VF] });
  });
});
