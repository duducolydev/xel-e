import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { utilisateurCourant } from "@/lib/api-serveur";
import { SuiviPaiement } from "./suivi-paiement";

export const metadata: Metadata = { title: "Paiement — Xel-E", robots: { index: false } };

// Page de retour après le paiement chez le fournisseur : on attend la confirmation (webhook) en
// interrogeant au besoin le fournisseur.
export default async function PageRetourPaiement({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { paiement, annule } = await searchParams;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/abonnement");
  if (typeof paiement !== "string") redirect("/abonnement");

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-bold text-brand-dark">Paiement</h1>
        <SuiviPaiement paiementId={paiement} annule={annule === "1"} />
      </main>
    </>
  );
}
