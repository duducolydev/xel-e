"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function ActionsEnfant({
  enfantId,
  prenom,
  accordParental,
}: {
  enfantId: string;
  prenom: string;
  accordParental: { requis: boolean; donne: boolean };
}) {
  const router = useRouter();
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function donnerAccord() {
    const resultat = await envoyer(`/parents/enfants/${enfantId}/accord-parental`);
    if (resultat.ok) router.refresh();
    else setErreur(resultat.message);
  }

  async function delier() {
    const resultat = await envoyer(`/parents/enfants/${enfantId}`, undefined, "DELETE");
    if (resultat.ok) {
      router.push("/parent");
      router.refresh();
    } else setErreur(resultat.message);
  }

  return (
    <div className="space-y-4">
      {accordParental.requis && !accordParental.donne ? (
        <section aria-labelledby="titre-accord" className="rounded-xl border border-brand-light bg-brand-wash p-5">
          <h2 id="titre-accord" className="font-semibold text-brand-dark">
            Forum d&apos;entraide
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            {prenom} a moins de 15 ans : le forum d&apos;entraide (questions et réponses entre élèves, modérées par
            l&apos;équipe Xel-E, sous pseudonyme) reste fermé tant que vous n&apos;avez pas donné votre accord.
          </p>
          <button
            type="button"
            onClick={donnerAccord}
            className="mt-3 rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand"
          >
            Autoriser l&apos;accès au forum
          </button>
        </section>
      ) : null}
      {accordParental.requis && accordParental.donne ? (
        <p className="text-sm text-gray-600">Vous avez autorisé l&apos;accès de {prenom} au forum d&apos;entraide.</p>
      ) : null}
      <div className="text-sm">
        {confirmer ? (
          <span className="flex flex-wrap items-center gap-3">
            Ne plus suivre {prenom} ?
            <button type="button" onClick={delier} className="font-semibold text-red-700 underline">
              Oui, retirer
            </button>
            <button type="button" onClick={() => setConfirmer(false)} className="text-gray-700 underline">
              Annuler
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmer(true)} className="font-medium text-red-700 underline underline-offset-4">
            Ne plus suivre cet enfant
          </button>
        )}
      </div>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
    </div>
  );
}
