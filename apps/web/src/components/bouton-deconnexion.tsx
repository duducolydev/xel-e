"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { envoyer } from "@/lib/api-client";

export function BoutonDeconnexion() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  return (
    <button
      type="button"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        await envoyer("/auth/deconnexion");
        router.replace("/connexion");
        router.refresh();
      }}
      className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
    >
      {enCours ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
