import type { DetailCorrection, Reponse } from "@xel-e/shared";

const STATUTS: Record<DetailCorrection["statut"], { libelle: string; classe: string; symbole: string }> = {
  correcte: { libelle: "Bonne réponse", classe: "border-green-200 bg-green-50 text-green-800", symbole: "✓" },
  partielle: { libelle: "Réponse en partie juste", classe: "border-amber-200 bg-amber-50 text-amber-900", symbole: "½" },
  incorrecte: { libelle: "Mauvaise réponse", classe: "border-red-200 bg-red-50 text-red-800", symbole: "✗" },
  "sans-reponse": { libelle: "Sans réponse", classe: "border-gray-200 bg-gray-50 text-gray-700", symbole: "–" },
};

function formater(detail: DetailCorrection, valeur: Reponse | string[] | boolean): string {
  if (valeur === null || (Array.isArray(valeur) && valeur.length === 0) || valeur === "") return "—";
  if (typeof valeur === "boolean") return valeur ? "Vrai" : "Faux";
  if (typeof valeur === "string") return valeur;
  if (detail.type === "QCM") {
    return valeur.map((id) => detail.choix?.find((c) => c.id === id)?.texte ?? id).join(" ; ");
  }
  return valeur.join(" ou ");
}

export function nombre(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Corrigé question par question (quiz et examens blancs) : réponse donnée, bonne réponse, points, explication.
export function CorrigeDetaille({ details }: { details: DetailCorrection[] }) {
  return (
    <ol className="space-y-4">
      {details.map((detail, index) => {
        const statut = STATUTS[detail.statut];
        return (
          <li key={detail.questionId} className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <p className="font-semibold text-gray-900">
                {index + 1}. {detail.enonce}
              </p>
              <span className={`self-start shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-medium ${statut.classe}`}>
                <span aria-hidden="true">{statut.symbole} </span>
                {statut.libelle}
              </span>
            </div>
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="text-gray-600">Ta réponse</dt>
              <dd className="text-gray-900">{formater(detail, detail.reponseDonnee)}</dd>
              <dt className="text-gray-600">Bonne réponse</dt>
              <dd className="font-medium text-gray-900">{formater(detail, detail.bonneReponse)}</dd>
              <dt className="text-gray-600">Points</dt>
              <dd className="text-gray-900">
                {nombre(detail.pointsObtenus)} / {detail.bareme}
              </dd>
            </dl>
            {detail.explication ? <p className="mt-3 text-sm text-gray-700">{detail.explication}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
