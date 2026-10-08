import { SEUIL_REUSSITE_QUIZ, type ResultatTentative } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CorrigeDetaille, nombre } from "@/components/corrige-detaille";
import { EntetePublic } from "@/components/entete-public";
import { appelerApi } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Résultat du quiz — Xel-E", robots: { index: false } };

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
          {resultat.xpGagne > 0 ? (
            <p className="mt-2 inline-block rounded-full bg-brand-dark px-3 py-1 text-sm font-semibold text-white">
              +{resultat.xpGagne} XP
            </p>
          ) : null}
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
          <CorrigeDetaille details={resultat.details} />
        </section>
      </main>
    </>
  );
}
