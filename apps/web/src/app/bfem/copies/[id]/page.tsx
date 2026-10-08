import type { EtatCopie } from "@xel-e/shared";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { SignalPresence } from "@/components/signal-presence";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { PassageExamen } from "./passage-examen";

export const metadata: Metadata = { title: "Examen blanc en cours — Xel-E", robots: { index: false } };

export default async function PageCopie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suite = `/connexion?suite=/bfem/copies/${id}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);

  const reponse = await appelerApi(`/bfem/copies/${encodeURIComponent(id)}`);
  if (reponse.status === 401) redirect(suite);
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (reponse.status === 404 || reponse.status === 400) notFound();
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const etat = (await reponse.json()) as EtatCopie;
  // Copie déjà rendue (par l'élève ou à la fin du temps) : direction le résultat.
  if (etat.terminee) redirect(`/bfem/copies/${id}/resultat`);

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl px-4 pb-10">
        <PassageExamen copie={etat} />
      </main>
      <SignalPresence />
    </>
  );
}
