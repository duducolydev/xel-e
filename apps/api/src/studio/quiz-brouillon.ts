import type { Prisma, TypeQuestion } from "@prisma/client";
import type { ChoixPublic, QuestionBrouillon, QuizBrouillon } from "@xel-e/shared";

export interface QuestionEnLigne {
  id: string;
  type: TypeQuestion;
  enonce: string;
  choix: Prisma.JsonValue;
  reponseCorrecte: Prisma.JsonValue;
  explication: string | null;
  bareme: number;
}

export interface DonneesQuestion {
  type: TypeQuestion;
  enonce: string;
  choix: Prisma.InputJsonValue | undefined;
  reponseCorrecte: Prisma.InputJsonValue;
  explication: string | null;
  bareme: number;
  ordre: number;
}

const textes = (valeur: Prisma.JsonValue): string[] =>
  Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : [];

// Quiz en ligne → format de l'éditeur (les bonnes réponses sont portées par chaque choix).
export function versBrouillon(questions: QuestionEnLigne[]): QuizBrouillon {
  return questions.map((question): QuestionBrouillon => {
    const commun = {
      id: question.id,
      enonce: question.enonce,
      bareme: question.bareme,
      explication: question.explication ?? undefined,
    };
    switch (question.type) {
      case "QCM": {
        const bonnes = new Set(textes(question.reponseCorrecte));
        const choix = (question.choix as ChoixPublic[] | null) ?? [];
        return { ...commun, type: "QCM", choix: choix.map((c) => ({ id: c.id, texte: c.texte, correct: bonnes.has(c.id) })) };
      }
      case "VRAI_FAUX":
        return { ...commun, type: "VRAI_FAUX", reponse: question.reponseCorrecte === true };
      case "REPONSE_COURTE":
        return { ...commun, type: "REPONSE_COURTE", reponsesAcceptees: textes(question.reponseCorrecte) };
    }
  });
}

// Format de l'éditeur → lignes Question (format attendu par la correction côté serveur).
export function versDonneesQuestion(question: QuestionBrouillon, ordre: number): DonneesQuestion {
  const commun = { enonce: question.enonce, bareme: question.bareme, explication: question.explication ?? null, ordre };
  switch (question.type) {
    case "QCM":
      return {
        ...commun,
        type: "QCM",
        choix: question.choix.map((c) => ({ id: c.id, texte: c.texte })),
        reponseCorrecte: question.choix.filter((c) => c.correct).map((c) => c.id),
      };
    case "VRAI_FAUX":
      return { ...commun, type: "VRAI_FAUX", choix: undefined, reponseCorrecte: question.reponse };
    case "REPONSE_COURTE":
      return { ...commun, type: "REPONSE_COURTE", choix: undefined, reponseCorrecte: question.reponsesAcceptees };
  }
}

export interface PlanSynchronisation {
  aModifier: { id: string; donnees: DonneesQuestion }[];
  aCreer: DonneesQuestion[];
  aSupprimer: string[];
}

// Conserve l'identifiant des questions existantes (les tentatives en cours gardent leurs réponses),
// crée les nouvelles et supprime celles retirées du brouillon.
export function planifierSynchronisation(existantes: string[], brouillon: QuizBrouillon): PlanSynchronisation {
  const connues = new Set(existantes);
  const plan: PlanSynchronisation = { aModifier: [], aCreer: [], aSupprimer: [] };
  const gardees = new Set<string>();
  brouillon.forEach((question, index) => {
    const donnees = versDonneesQuestion(question, index + 1);
    if (question.id && connues.has(question.id) && !gardees.has(question.id)) {
      gardees.add(question.id);
      plan.aModifier.push({ id: question.id, donnees });
    } else {
      plan.aCreer.push(donnees);
    }
  });
  plan.aSupprimer = existantes.filter((id) => !gardees.has(id));
  return plan;
}
