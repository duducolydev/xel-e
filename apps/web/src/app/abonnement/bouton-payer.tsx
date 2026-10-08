"use client";

import { useEffect, useState } from "react";
import { envoyer } from "@/lib/api-client";

// Ouvre le paiement chez le fournisseur (Wave, Orange Money ou simulateur) dans la même page.
export function BoutonPayer({ plan, fournisseur, beneficiaireId, libelle }: { plan: string; fournisseur: string; beneficiaireId?: string; libelle: string }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Boutons inactifs tant que la page n'est pas interactive : un clic ne doit jamais se perdre.
  const [pret, setPret] = useState(false);
  useEffect(() => setPret(true), []);

  return (
    <div>
      <button
        type="button"
        disabled={!pret || enCours}
        onClick={async () => {
          setEnCours(true);
          setErreur(null);
          const resultat = await envoyer<{ paiementId: string; urlPaiement: string }>("/paiements", { plan, fournisseur, beneficiaireId });
          if (resultat.ok) {
            window.location.assign(resultat.donnees.urlPaiement);
            return;
          }
          setEnCours(false);
          setErreur(resultat.message);
        }}
        className="w-full rounded-lg bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand disabled:opacity-60"
      >
        {enCours ? "Redirection vers le paiement…" : libelle}
      </button>
      {erreur ? <p className="mt-1 text-sm text-red-700">{erreur}</p> : null}
    </div>
  );
}
