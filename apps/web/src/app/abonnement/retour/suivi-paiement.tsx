"use client";

import type { EtatAbonnement, PaiementDto } from "@xel-e/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

const DELAI_MAX_MS = 60_000;

export function SuiviPaiement({ paiementId, annule }: { paiementId: string; annule: boolean }) {
  const [paiement, setPaiement] = useState<PaiementDto | null>(null);
  const [jusquau, setJusquau] = useState<string | null>(null);
  const [delaiDepasse, setDelaiDepasse] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    const debut = Date.now();
    async function verifier() {
      const resultat = await envoyer<PaiementDto>(`/paiements/${paiementId}/verifier`);
      if (!actif) return;
      if (!resultat.ok) {
        setErreur(resultat.message);
        return;
      }
      setPaiement(resultat.donnees);
      if (resultat.donnees.statut === "CONFIRME") {
        const etat = await envoyer<{ etat: EtatAbonnement }>("/abonnement", undefined, "GET");
        if (actif && etat.ok) setJusquau(etat.donnees.etat.jusquau);
        return;
      }
      if (resultat.donnees.statut === "ECHOUE") return;
      if (Date.now() - debut > DELAI_MAX_MS) {
        setDelaiDepasse(true);
        return;
      }
      window.setTimeout(verifier, 2000);
    }
    void verifier();
    return () => {
      actif = false;
    };
  }, [paiementId]);

  if (erreur) return <Alerte ton="erreur">{erreur}</Alerte>;
  if (!paiement || (paiement.statut === "EN_ATTENTE" && !delaiDepasse)) {
    return (
      <div role="status" className="rounded-xl border border-gray-200 p-6 text-center">
        <p className="font-semibold text-gray-900">{annule ? "Paiement annulé ? Vérification…" : "Confirmation du paiement en cours…"}</p>
        <p className="mt-1 text-sm text-gray-600">Cela prend en général quelques secondes. Ne ferme pas cette page.</p>
      </div>
    );
  }
  if (paiement.statut === "CONFIRME") {
    const fin = jusquau ? new Date(jusquau).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" }) : null;
    return (
      <div className="space-y-4">
        <Alerte ton="succes">
          Paiement confirmé : l&apos;accès Premium de {paiement.beneficiaire} est activé{fin ? ` jusqu'au ${fin}` : ""}. Reçu n° {paiement.numeroRecu}.
        </Alerte>
        <div className="flex flex-wrap gap-3">
          <Link href="/bfem" className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand">
            Aller aux examens blancs
          </Link>
          <Link href="/abonnement" className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-wash">
            Mon abonnement
          </Link>
        </div>
      </div>
    );
  }
  if (paiement.statut === "ECHOUE") {
    return (
      <div className="space-y-4">
        <Alerte ton="erreur">Le paiement n&apos;a pas abouti : aucun montant n&apos;a été validé. Tu peux réessayer.</Alerte>
        <Link href="/abonnement" className="inline-block rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand">
          Revenir à mon abonnement
        </Link>
      </div>
    );
  }
  return (
    <Alerte ton="info">
      Nous n&apos;avons pas encore reçu la confirmation du paiement. Si tu as bien payé, ton accès s&apos;activera dès sa réception
      (tu recevras une notification). <Link href="/abonnement" className="font-semibold underline">Mon abonnement</Link>
    </Alerte>
  );
}
