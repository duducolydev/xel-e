"use client";

import { useState } from "react";
import { Alerte, Bouton } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

// Clic explicite, jamais au chargement : les antivirus de messagerie ouvrent les liens des emails.
export function BoutonDesinscription({ token }: { token: string }) {
  const [etat, setEtat] = useState<{ enCours: boolean; fait?: boolean; erreur?: string }>({ enCours: false });

  if (etat.fait) {
    return (
      <Alerte ton="succes">
        C&apos;est noté : vous ne recevrez plus le résumé d&apos;activité. Vous pouvez le réactiver à tout moment depuis votre
        espace parent.
      </Alerte>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">Vous ne souhaitez plus recevoir le résumé d&apos;activité de votre enfant ?</p>
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <Bouton
        type="button"
        enCours={etat.enCours}
        onClick={async () => {
          setEtat({ enCours: true });
          const resultat = await envoyer("/parents/desinscription", { token });
          setEtat(resultat.ok ? { enCours: false, fait: true } : { enCours: false, erreur: resultat.message });
        }}
      >
        Ne plus recevoir le résumé
      </Bouton>
    </div>
  );
}
