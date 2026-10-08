"use client";

import type { EtatCopie } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function BoutonCommencer({ slug }: { slug: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={enCours}
        onClick={async () => {
          setEnCours(true);
          const resultat = await envoyer<EtatCopie>(`/bfem/examens/${slug}/copies`);
          if (resultat.ok) {
            router.push(`/bfem/copies/${resultat.donnees.id}`);
            return;
          }
          setEnCours(false);
          setErreur(resultat.message);
        }}
        className="rounded-lg bg-brand-dark px-5 py-3 font-semibold text-white hover:bg-brand disabled:opacity-60"
      >
        {enCours ? "Préparation…" : "Commencer l'examen"}
      </button>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
    </div>
  );
}
