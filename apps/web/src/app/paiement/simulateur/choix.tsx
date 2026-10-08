"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function ChoixSimulateur({ reference, paiementId }: { reference: string; paiementId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Boutons inactifs tant que la page n'est pas interactive : un clic ne doit jamais se perdre.
  const [pret, setPret] = useState(false);
  useEffect(() => setPret(true), []);

  async function decider(issue: "payer" | "refuser") {
    setEnCours(true);
    const resultat = await envoyer(`/paiements/simulateur/${encodeURIComponent(reference)}/${issue}`);
    if (!resultat.ok) {
      setEnCours(false);
      setErreur(resultat.message);
      return;
    }
    router.push(`/abonnement/retour?paiement=${paiementId}${issue === "refuser" ? "&annule=1" : ""}`);
  }

  return (
    <div className="space-y-3">
      <button type="button" disabled={!pret || enCours} onClick={() => decider("payer")} className="w-full rounded-lg bg-brand-dark px-4 py-3 font-semibold text-white hover:bg-brand disabled:opacity-60">
        Simuler un paiement réussi
      </button>
      <button type="button" disabled={!pret || enCours} onClick={() => decider("refuser")} className="w-full rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60">
        Simuler un refus
      </button>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
    </div>
  );
}
