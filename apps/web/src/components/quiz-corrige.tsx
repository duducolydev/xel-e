import type { QuizBrouillon } from "@xel-e/shared";

// Quiz tel qu'il sera mis en ligne, bonnes réponses comprises (relecture uniquement).
export function QuizCorrige({ quiz }: { quiz: QuizBrouillon }) {
  if (quiz.length === 0) return <p className="text-sm text-gray-600">Cette leçon n&apos;a pas de quiz.</p>;
  return (
    <ol className="space-y-3">
      {quiz.map((question, index) => (
        <li key={question.id ?? index} className="rounded-xl border border-gray-200 p-4 text-sm">
          <p className="font-medium text-gray-900">
            {index + 1}. {question.enonce}{" "}
            <span className="font-normal text-gray-500">
              ({question.bareme} pt{question.bareme > 1 ? "s" : ""})
            </span>
          </p>
          {question.type === "QCM" ? (
            <ul className="mt-2 space-y-1">
              {question.choix.map((choix) => (
                <li key={choix.id} className={choix.correct ? "font-semibold text-green-800" : "text-gray-700"}>
                  {choix.correct ? "✔ " : "✘ "}
                  {choix.texte}
                  <span className="sr-only">{choix.correct ? " (bonne réponse)" : " (mauvaise réponse)"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {question.type === "VRAI_FAUX" ? (
            <p className="mt-2 text-green-800">Réponse attendue : {question.reponse ? "Vrai" : "Faux"}</p>
          ) : null}
          {question.type === "REPONSE_COURTE" ? (
            <p className="mt-2 text-green-800">Réponses acceptées : {question.reponsesAcceptees.join(" · ")}</p>
          ) : null}
          {question.explication ? <p className="mt-2 text-gray-600">Explication : {question.explication}</p> : null}
        </li>
      ))}
    </ol>
  );
}
