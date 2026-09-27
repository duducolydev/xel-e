"use client";

import type { QuestionBrouillon, QuizBrouillon } from "@xel-e/shared";

type TypeQuestion = QuestionBrouillon["type"];

const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  QCM: "QCM",
  VRAI_FAUX: "Vrai ou faux",
  REPONSE_COURTE: "Réponse courte",
};

const IDS_CHOIX = "abcdefgh";
const MAX_CHOIX = 6;

function nouvelleQuestion(type: TypeQuestion): QuestionBrouillon {
  const commun = { enonce: "", bareme: 1, explication: undefined };
  if (type === "QCM") {
    return {
      ...commun,
      type,
      choix: [
        { id: "a", texte: "", correct: true },
        { id: "b", texte: "", correct: false },
      ],
    };
  }
  if (type === "VRAI_FAUX") return { ...commun, type, reponse: true };
  return { ...commun, type, reponsesAcceptees: [""] };
}

const classeChamp =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light";
const classeLienAction = "text-sm font-medium text-brand-dark underline underline-offset-4 disabled:opacity-40";

// Erreurs renvoyées par l'API pour une question donnée (clés du type « quiz.2.choix »).
function erreursDe(erreurs: Record<string, string>, index: number): string[] {
  return Object.entries(erreurs)
    .filter(([cle]) => cle === `quiz.${index}` || cle.startsWith(`quiz.${index}.`))
    .map(([, message]) => message);
}

export function EditeurQuiz({
  quiz,
  onChange,
  erreurs,
}: {
  quiz: QuizBrouillon;
  onChange: (quiz: QuizBrouillon) => void;
  erreurs: Record<string, string>;
}) {
  const remplacer = (index: number, question: QuestionBrouillon) =>
    onChange(quiz.map((q, i) => (i === index ? question : q)));
  const deplacer = (index: number, sens: -1 | 1) => {
    const copie = [...quiz];
    const [question] = copie.splice(index, 1);
    copie.splice(index + sens, 0, question!);
    onChange(copie);
  };

  return (
    <div className="space-y-4">
      {quiz.length === 0 ? (
        <p className="text-sm text-gray-600">Pas encore de question : la leçon sera publiée sans quiz.</p>
      ) : null}
      {quiz.map((question, index) => {
        const numero = index + 1;
        const problemes = erreursDe(erreurs, index);
        return (
          <fieldset
            key={question.id ?? `nouvelle-${index}`}
            className={`space-y-3 rounded-xl border p-4 ${problemes.length > 0 ? "border-red-400" : "border-gray-200"}`}
          >
            <legend className="px-1 text-sm font-semibold text-gray-900">
              Question {numero} · {LIBELLES_TYPE[question.type]}
            </legend>
            <div>
              <label htmlFor={`enonce-${index}`} className="mb-1 block text-sm font-medium text-gray-800">
                Énoncé de la question {numero}
              </label>
              <textarea
                id={`enonce-${index}`}
                rows={2}
                value={question.enonce}
                onChange={(e) => remplacer(index, { ...question, enonce: e.target.value })}
                className={classeChamp}
              />
            </div>

            {question.type === "QCM" ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">Choix (coche la ou les bonnes réponses)</p>
                {question.choix.map((choix, indexChoix) => (
                  <div key={choix.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`correct-${index}-${choix.id}`}
                      checked={choix.correct}
                      onChange={(e) =>
                        remplacer(index, {
                          ...question,
                          choix: question.choix.map((c) => (c.id === choix.id ? { ...c, correct: e.target.checked } : c)),
                        })
                      }
                      className="h-5 w-5 accent-brand-dark"
                      aria-label={`Choix ${indexChoix + 1} de la question ${numero} correct`}
                    />
                    <input
                      type="text"
                      value={choix.texte}
                      aria-label={`Choix ${indexChoix + 1} de la question ${numero}`}
                      onChange={(e) =>
                        remplacer(index, {
                          ...question,
                          choix: question.choix.map((c) => (c.id === choix.id ? { ...c, texte: e.target.value } : c)),
                        })
                      }
                      className={classeChamp}
                    />
                    <button
                      type="button"
                      disabled={question.choix.length <= 2}
                      onClick={() => remplacer(index, { ...question, choix: question.choix.filter((c) => c.id !== choix.id) })}
                      className={classeLienAction}
                      aria-label={`Retirer le choix ${indexChoix + 1} de la question ${numero}`}
                    >
                      Retirer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={question.choix.length >= MAX_CHOIX}
                  onClick={() => {
                    const id = [...IDS_CHOIX].find((lettre) => !question.choix.some((c) => c.id === lettre)) ?? "z";
                    remplacer(index, { ...question, choix: [...question.choix, { id, texte: "", correct: false }] });
                  }}
                  className={classeLienAction}
                >
                  Ajouter un choix
                </button>
              </div>
            ) : null}

            {question.type === "VRAI_FAUX" ? (
              <div className="flex gap-4" role="radiogroup" aria-label={`Réponse attendue à la question ${numero}`}>
                {[true, false].map((valeur) => (
                  <label key={String(valeur)} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`reponse-${index}`}
                      checked={question.reponse === valeur}
                      onChange={() => remplacer(index, { ...question, reponse: valeur })}
                      className="h-4 w-4 accent-brand-dark"
                    />
                    {valeur ? "Vrai" : "Faux"}
                  </label>
                ))}
              </div>
            ) : null}

            {question.type === "REPONSE_COURTE" ? (
              <div>
                <label htmlFor={`acceptees-${index}`} className="mb-1 block text-sm font-medium text-gray-800">
                  Réponses acceptées pour la question {numero} (une par ligne)
                </label>
                <textarea
                  id={`acceptees-${index}`}
                  rows={2}
                  value={question.reponsesAcceptees.join("\n")}
                  onChange={(e) => remplacer(index, { ...question, reponsesAcceptees: e.target.value.split("\n") })}
                  className={classeChamp}
                />
                <p className="mt-1 text-xs text-gray-500">Majuscules, accents et point final sont ignorés à la correction.</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div>
                <label htmlFor={`bareme-${index}`} className="mb-1 block text-sm font-medium text-gray-800">
                  Points
                </label>
                <input
                  id={`bareme-${index}`}
                  type="number"
                  min={1}
                  max={10}
                  value={question.bareme}
                  onChange={(e) => remplacer(index, { ...question, bareme: Number(e.target.value) })}
                  className={classeChamp}
                />
              </div>
              <div>
                <label htmlFor={`explication-${index}`} className="mb-1 block text-sm font-medium text-gray-800">
                  Explication affichée avec le corrigé (facultatif)
                </label>
                <input
                  id={`explication-${index}`}
                  type="text"
                  value={question.explication ?? ""}
                  onChange={(e) => remplacer(index, { ...question, explication: e.target.value || undefined })}
                  className={classeChamp}
                />
              </div>
            </div>

            {problemes.length > 0 ? (
              <ul className="space-y-1 text-sm text-red-700">
                {problemes.map((probleme) => (
                  <li key={probleme}>{probleme}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-4">
              <button type="button" disabled={index === 0} onClick={() => deplacer(index, -1)} className={classeLienAction}>
                Monter
              </button>
              <button type="button" disabled={index === quiz.length - 1} onClick={() => deplacer(index, 1)} className={classeLienAction}>
                Descendre
              </button>
              <button
                type="button"
                onClick={() => onChange(quiz.filter((_, i) => i !== index))}
                className="text-sm font-medium text-red-700 underline underline-offset-4"
              >
                Supprimer la question {numero}
              </button>
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-800">Ajouter une question :</span>
        {(Object.keys(LIBELLES_TYPE) as TypeQuestion[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange([...quiz, nouvelleQuestion(type)])}
            className="rounded-lg border border-brand-dark px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-brand-wash"
          >
            {LIBELLES_TYPE[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
