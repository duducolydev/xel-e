"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { envoyer } from "@/lib/api-client";

export function BoutonValider({ id, nom }: { id: string; nom: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={enCours}
        aria-label={`Valider le compte de ${nom}`}
        onClick={async () => {
          setEnCours(true);
          const resultat = await envoyer(`/admin/professeurs/${id}/valider`);
          setEnCours(false);
          if (resultat.ok) router.refresh();
          else setErreur(resultat.message);
        }}
        className="rounded-lg bg-brand-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand disabled:opacity-60"
      >
        {enCours ? "Validation…" : "Valider"}
      </button>
      {erreur ? <p className="text-xs text-red-700">{erreur}</p> : null}
    </div>
  );
}
