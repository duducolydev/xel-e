"use client";

import Link from "next/link";
import { useState } from "react";
import { Alerte, Bouton } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

// Action déclenchée par un clic, jamais au chargement : les antivirus de messagerie
// ouvrent les liens des emails et consommeraient le jeton à la place du destinataire.
export function ActionJeton({
  chemin,
  token,
  libelle,
  suite,
}: {
  chemin: string;
  token: string | undefined;
  libelle: string;
  suite?: { href: string; libelle: string };
}) {
  const [etat, setEtat] = useState<{ enCours: boolean; succes?: string; erreur?: string }>({
    enCours: false,
  });

  if (!token) return <Alerte ton="erreur">Ce lien est incomplet. Ouvre-le directement depuis l&apos;email reçu.</Alerte>;

  if (etat.succes) {
    return (
      <div className="space-y-4">
        <Alerte ton="succes">{etat.succes}</Alerte>
        {suite ? (
          <Link
            href={suite.href}
            className="block rounded-lg bg-brand-dark px-4 py-3 text-center font-semibold text-white hover:bg-brand"
          >
            {suite.libelle}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      <Bouton
        type="button"
        enCours={etat.enCours}
        onClick={async () => {
          setEtat({ enCours: true });
          const resultat = await envoyer<{ message: string }>(chemin, { token });
          setEtat(
            resultat.ok
              ? { enCours: false, succes: resultat.donnees.message }
              : { enCours: false, erreur: resultat.message },
          );
        }}
      >
        {libelle}
      </Bouton>
    </div>
  );
}
