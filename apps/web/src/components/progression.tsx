"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { envoyer } from "@/lib/api-client";

export function BarreProgression({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valeur}
      className="h-2.5 overflow-hidden rounded-full bg-gray-200"
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${valeur}%` }} />
    </div>
  );
}

export function BoutonNotificationsLues() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  return (
    <button
      type="button"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        await envoyer("/progression/notifications/lues");
        setEnCours(false);
        router.refresh();
      }}
      className="text-sm font-medium text-brand-dark underline underline-offset-4 disabled:opacity-60"
    >
      Tout marquer comme lu
    </button>
  );
}
