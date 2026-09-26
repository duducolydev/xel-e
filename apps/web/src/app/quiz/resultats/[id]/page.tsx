import { SEUIL_REUSSITE_QUIZ, type DetailCorrection, type Reponse, type ResultatTentative } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntetePublic } from "@/components/entete-public";
import { appelerApi } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Résultat du quiz — Xel-E", robots: { index: false } };

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

function nombre(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default async function PageResultat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reponse = await appelerApi(`/quiz/tentatives/${encodeURIComponent(id)}`);
  if (reponse.status === 401) redirect(`/connexion?suite=/quiz/resultats/${id}`);
  if (reponse.status === 404 || reponse.status === 400) notFound();
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const resultat = (await reponse.json()) as ResultatTentative;
  const reussi = resultat.score >= SEUIL_REUSSITE_QUIZ;
  const cheminLecon = `/cours/${resultat.lecon.niveau}/${resultat.lecon.matiere}/${resultat.lecon.slug}`;

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-brand-dark">Résultat : {resultat.lecon.titre}</h1>

        <section
          aria-label="Score"
          className={`rounded-2xl border p-6 text-center ${reussi ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}
        >
          <p className="text-5xl font-bold text-gray-900">{nombre(resultat.score)} %</p>
          <p className="mt-2 text-gray-700">
            {nombre(resultat.pointsObtenus)} point{resultat.pointsObtenus > 1 ? "s" : ""} sur {resultat.pointsTotal}
          </p>
          <p className="mt-3 font-semibold text-gray-900">
            {reussi ? "Bravo, quiz réussi !" : "Pas encore : relis la leçon et retente ta chance."}
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href={`${cheminLecon}/quiz`} className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand">
            Refaire le quiz
          </Link>
          <Link href={cheminLecon} className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-wash">
            Revoir la leçon
          </Link>
          <Link href="/mes-quiz" className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-wash">
            Mes quiz
          </Link>
        </div>

        <section aria-labelledby="titre-corrige" className="space-y-4">
          <h2 id="titre-corrige" className="text-xl font-bold text-gray-900">
            Corrigé
          </h2>
          <ol className="space-y-4">
            {resultat.details.map((detail, index) => {
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
        </section>
      </main>
    </>
  );
}
