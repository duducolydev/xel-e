import type { ChoixPublic, DetailCorrection, Reponse, StatutQuestion, TypeQuestionQuiz } from "@xel-e/shared";

export interface QuestionCorrigible {
  id: string;
  type: TypeQuestionQuiz;
  enonce: string;
  choix: ChoixPublic[] | null;
  // QCM : identifiants des bons choix ; VRAI_FAUX : booléen ; REPONSE_COURTE : réponses acceptées.
  reponseCorrecte: unknown;
  bareme: number;
  explication: string | null;
}

export interface Corrige {
  statut: StatutQuestion;
  pointsObtenus: number;
}

export interface ResultatCorrection {
  details: DetailCorrection[];
  pointsObtenus: number;
  pointsTotal: number;
  score: number;
}

const arrondir = (valeur: number, decimales: number) => {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
};

export function normaliserReponseCourte(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[.!?;:]+$/, "");
}

function listeDeTextes(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : [];
}

function statutSelon(points: number, bareme: number): StatutQuestion {
  if (points >= bareme) return "correcte";
  return points > 0 ? "partielle" : "incorrecte";
}

// QCM : bareme × (bonnes cochées − mauvaises cochées) / nombre de bonnes, jamais négatif (D0014).
function corrigerQcm(question: QuestionCorrigible, reponse: Reponse): Corrige {
  if (!Array.isArray(reponse)) return { statut: "sans-reponse", pointsObtenus: 0 };
  const bonnes = new Set(listeDeTextes(question.reponseCorrecte));
  const valides = new Set((question.choix ?? []).map((c) => c.id));
  const cochees = [...new Set(reponse)].filter((id) => valides.has(id));
  if (cochees.length === 0) return { statut: "sans-reponse", pointsObtenus: 0 };

  const justes = cochees.filter((id) => bonnes.has(id)).length;
  const fausses = cochees.length - justes;
  const ratio = bonnes.size === 0 ? 0 : Math.max(0, (justes - fausses) / bonnes.size);
  const points = arrondir(question.bareme * ratio, 2);
  return { statut: statutSelon(points, question.bareme), pointsObtenus: points };
}

export function corrigerQuestion(question: QuestionCorrigible, reponse: Reponse | undefined): Corrige {
  const donnee = reponse ?? null;
  switch (question.type) {
    case "QCM":
      return corrigerQcm(question, donnee);
    case "VRAI_FAUX": {
      if (typeof donnee !== "boolean") return { statut: "sans-reponse", pointsObtenus: 0 };
      const juste = donnee === question.reponseCorrecte;
      return { statut: juste ? "correcte" : "incorrecte", pointsObtenus: juste ? question.bareme : 0 };
    }
    case "REPONSE_COURTE": {
      if (typeof donnee !== "string" || donnee.trim() === "") return { statut: "sans-reponse", pointsObtenus: 0 };
      const acceptees = listeDeTextes(question.reponseCorrecte).map(normaliserReponseCourte);
      const juste = acceptees.includes(normaliserReponseCourte(donnee));
      return { statut: juste ? "correcte" : "incorrecte", pointsObtenus: juste ? question.bareme : 0 };
    }
  }
}

function bonneReponse(question: QuestionCorrigible): string[] | boolean {
  return question.type === "VRAI_FAUX"
    ? question.reponseCorrecte === true
    : listeDeTextes(question.reponseCorrecte);
}

export function corrigerTentative(
  questions: QuestionCorrigible[],
  reponses: Record<string, Reponse>,
): ResultatCorrection {
  const details = questions.map((question): DetailCorrection => {
    const reponseDonnee = reponses[question.id] ?? null;
    const { statut, pointsObtenus } = corrigerQuestion(question, reponseDonnee);
    return {
      questionId: question.id,
      type: question.type,
      enonce: question.enonce,
      ...(question.choix ? { choix: question.choix } : {}),
      reponseDonnee,
      bonneReponse: bonneReponse(question),
      statut,
      pointsObtenus,
      bareme: question.bareme,
      explication: question.explication,
    };
  });
  const pointsObtenus = arrondir(details.reduce((total, d) => total + d.pointsObtenus, 0), 2);
  const pointsTotal = questions.reduce((total, q) => total + q.bareme, 0);
  return {
    details,
    pointsObtenus,
    pointsTotal,
    score: pointsTotal === 0 ? 0 : arrondir((pointsObtenus / pointsTotal) * 100, 1),
  };
}
