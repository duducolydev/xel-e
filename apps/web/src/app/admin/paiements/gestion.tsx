"use client";

import type { PlanDto } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { envoyer } from "@/lib/api-client";

export function LignePlan({ plan }: { plan: PlanDto & { actif: boolean } }) {
  const router = useRouter();
  const [prix, setPrix] = useState(String(plan.prixFcfa));
  const [actif, setActif] = useState(plan.actif);
  const [message, setMessage] = useState<string | null>(null);

  async function enregistrer() {
    const resultat = await envoyer(`/admin/plans/${plan.code}`, { prixFcfa: Number(prix.replace(/\s/g, "")), actif }, "PATCH");
    if (resultat.ok) {
      setMessage("Enregistré.");
      router.refresh();
    } else setMessage(Object.values(resultat.erreurs)[0] ?? resultat.message);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
      <span className="min-w-40 font-medium text-gray-900">
        {plan.libelle}
        {plan.aConfirmer ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">à confirmer</span> : null}
      </span>
      <label className="flex items-center gap-2 text-sm">
        Prix (FCFA)
        <input value={prix} onChange={(e) => setPrix(e.target.value)} inputMode="numeric" className="w-28 rounded border border-gray-300 px-2 py-1" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} className="h-4 w-4 accent-brand-dark" />
        Proposée
      </label>
      <button type="button" onClick={enregistrer} className="ml-auto text-sm font-semibold text-brand-dark underline">
        {plan.aConfirmer ? "Confirmer" : "Enregistrer"}
      </button>
      {message ? <span className="w-full text-sm text-gray-700">{message}</span> : null}
    </li>
  );
}

export function CycleAbonnements() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section aria-labelledby="titre-cycle" className="space-y-2">
      <h2 id="titre-cycle" className="text-lg font-semibold text-gray-900">
        Cycle des abonnements
      </h2>
      <p className="text-sm text-gray-600">Les expirations et les relances (3 jours avant l&apos;échéance) passent automatiquement chaque heure.</p>
      <button
        type="button"
        onClick={async () => {
          const resultat = await envoyer<{ expires: number; relances: number }>("/admin/abonnements/cycle");
          setMessage(resultat.ok ? `${resultat.donnees.expires} période(s) expirée(s), ${resultat.donnees.relances} relance(s) envoyée(s).` : resultat.message);
        }}
        className="rounded-lg border border-brand-dark px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-wash"
      >
        Lancer maintenant
      </button>
      {message ? <p className="text-sm text-gray-700" role="status">{message}</p> : null}
    </section>
  );
}
