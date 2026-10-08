import { formaterFcfa } from "@xel-e/shared";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CarteAuth } from "@/components/carte-auth";
import { Alerte } from "@/components/ui";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { ChoixSimulateur } from "./choix";

export const metadata: Metadata = { title: "Simulateur de paiement — Xel-E", robots: { index: false } };

// Remplace la page de Wave / Orange Money en développement et en test (jamais en production).
export default async function PageSimulateur({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ref } = await searchParams;
  if (typeof ref !== "string") notFound();
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(`/connexion?suite=${encodeURIComponent(`/paiement/simulateur?ref=${ref}`)}`);
  const reponse = await appelerApi(`/paiements/simulateur/${encodeURIComponent(ref)}`);
  if (!reponse.ok) notFound();
  const paiement = (await reponse.json()) as { paiementId: string; montant: number; plan: string; beneficiaire: string; statut: string };

  return (
    <CarteAuth titre="Simulateur de paiement" sousTitre="Environnement de test : aucun argent réel n'est débité.">
      <div className="space-y-4">
        <Alerte ton="info">Cette page remplace celle de Wave ou d&apos;Orange Money pendant les tests.</Alerte>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-600">Offre</dt>
          <dd className="font-medium text-gray-900">{paiement.plan}</dd>
          <dt className="text-gray-600">Pour</dt>
          <dd className="font-medium text-gray-900">{paiement.beneficiaire}</dd>
          <dt className="text-gray-600">Montant</dt>
          <dd className="text-lg font-bold text-brand-dark">{formaterFcfa(paiement.montant)}</dd>
        </dl>
        {paiement.statut === "EN_ATTENTE" ? (
          <ChoixSimulateur reference={ref} paiementId={paiement.paiementId} />
        ) : (
          <Alerte ton="info">Ce paiement est déjà traité.</Alerte>
        )}
      </div>
    </CarteAuth>
  );
}
