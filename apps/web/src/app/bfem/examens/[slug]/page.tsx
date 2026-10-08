import type { ExamenDetail } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { BoutonCommencer } from "./bouton-commencer";

export const metadata: Metadata = { title: "Examen blanc — Xel-E" };

export default async function PageExamen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const suite = `/connexion?suite=/bfem/examens/${slug}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);

  const reponse = await appelerApi(`/bfem/examens/${encodeURIComponent(slug)}`);
  if (reponse.status === 401) redirect(suite);
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (reponse.status === 404) notFound();
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const examen = (await reponse.json()) as ExamenDetail;
  if (examen.copieEnCours) redirect(`/bfem/copies/${examen.copieEnCours}`);

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Link href="/bfem" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Préparer le BFEM
        </Link>
        <div>
          <p className="text-sm font-medium text-brand-texte">{examen.epreuve.libelle}</p>
          <h1 className="text-2xl font-bold text-brand-dark">{examen.titre}</h1>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Durée", `${examen.dureeMinutes} min`],
            ["Questions", String(examen.nombreQuestions)],
            ["Barème", "sur 20"],
          ].map(([libelle, valeur]) => (
            <div key={libelle} className="rounded-xl border border-gray-200 p-3">
              <dt className="text-sm text-gray-600">{libelle}</dt>
              <dd className="mt-1 text-lg font-bold text-brand-dark">{valeur}</dd>
            </div>
          ))}
        </dl>
        {examen.consignes ? (
          <section aria-labelledby="titre-consignes" className="rounded-xl border border-gray-200 p-5">
            <h2 id="titre-consignes" className="font-semibold text-gray-900">
              Consignes
            </h2>
            <p className="mt-2 whitespace-pre-line text-gray-700">{examen.consignes}</p>
          </section>
        ) : null}
        {examen.accessible ? (
          <>
            <Alerte ton="info">
              Le minuteur démarre dès que tu commences et continue même si tu fermes la page. À la fin du temps, ta copie
              est rendue automatiquement avec les réponses déjà enregistrées.
            </Alerte>
            <BoutonCommencer slug={examen.slug} />
          </>
        ) : (
          <Alerte ton="info">Cet examen blanc est réservé aux abonnés Premium.</Alerte>
        )}
      </main>
    </>
  );
}
