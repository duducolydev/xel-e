import type { ChoixPublic, QuestionPublique } from "@xel-e/shared";
import type { QuestionCorrigible } from "./correction";

// Liste blanche de champs : seuls id et texte d'un choix partent, même si la base en contient d'autres.
function choixPublics(choix: ChoixPublic[] | null): ChoixPublic[] {
  return (choix ?? []).map(({ id, texte }) => ({ id, texte }));
}

export function versQuestionPublique(question: QuestionCorrigible): QuestionPublique {
  const base = { id: question.id, type: question.type, enonce: question.enonce, bareme: question.bareme };
  if (question.type !== "QCM") return base;
  const nombreBonnes = Array.isArray(question.reponseCorrecte) ? question.reponseCorrecte.length : 0;
  return { ...base, choix: choixPublics(question.choix), multiple: nombreBonnes > 1 };
}
