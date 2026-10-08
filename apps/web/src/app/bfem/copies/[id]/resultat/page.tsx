import type { ResultatCopie } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CorrigeDetaille, nombre } from "@/components/corrige-detaille";
import { EnteteConnecte } from "@/components/entete-connecte";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Résultat de l'examen blanc — Xel-E", robots: { index: false } };

export default async function PageResultatExamen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suite = `/connexion?suite=/bfem/copies/${id}/resultat`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);

  // Lire la copie la rend si le temps est écoulé (filet de sécurité), puis on lit le résultat.
  const etat = await appelerApi(`/bfem/copies/${encodeURIComponent(id)}`);
  if (etat.status === 401) redirect(suite);
  if (etat.status === 404 || etat.status === 400) notFound();
  if (etat.ok && !((await etat.json()) as { terminee: boolean }).terminee) redirect(`/bfem/copies/${id}`);
  const reponse = await appelerApi(`/bfem/copies/${encodeURIComponent(id)}/resultat`);
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const resultat = (await reponse.json()) as ResultatCopie;
  const auDessus = resultat.note >= 10;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <p className="text-sm font-medium text-brand-texte">{resultat.examen.epreuve}</p>
          <h1 className="text-2xl font-bold text-brand-dark">Résultat : {resultat.examen.titre}</h1>
        </div>
        {resultat.soumissionAuto ? (
          <Alerte ton="info">Temps écoulé : ta copie a été rendue automatiquement avec les réponses enregistrées avant la fin.</Alerte>
        ) : null}
        <section
          aria-label="Note"
          className={`rounded-2xl border p-6 text-center ${auDessus ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}
        >
          <p className="text-5xl font-bold text-gray-900" data-testid="note-examen">
            {nombre(resultat.note)} / 20
          </p>
          <p className="mt-2 text-gray-700">
            {nombre(resultat.pointsObtenus)} point{resultat.pointsObtenus > 1 ? "s" : ""} sur {resultat.pointsTotal}
          </p>
          <p className="mt-3 font-semibold text-gray-900">
            {auDessus ? "Au-dessus de la moyenne, continue comme ça !" : "En dessous de la moyenne : relis le corrigé et réessaie."}
          </p>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link href="/bfem/historique" className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand">
            Mon historique
          </Link>
          <Link href="/bfem" className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-wash">
            Autres examens
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
