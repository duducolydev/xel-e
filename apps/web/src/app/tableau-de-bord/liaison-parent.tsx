"use client";

import type { CodeLiaisonGenere } from "@xel-e/shared";
import { useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

function dateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" });
}

export function LiaisonParent({ nombreParents }: { nombreParents: number }) {
  const [code, setCode] = useState<CodeLiaisonGenere | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function generer() {
    setEnCours(true);
    const resultat = await envoyer<CodeLiaisonGenere>("/parents/code");
    setEnCours(false);
    if (resultat.ok) setCode(resultat.donnees);
    else setErreur(resultat.message);
  }

  return (
    <section aria-labelledby="titre-liaison" className="rounded-xl border border-gray-200 p-5">
      <h2 id="titre-liaison" className="font-semibold text-gray-900">
        Mes parents
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        {nombreParents === 0
          ? "Aucun parent ne suit encore ta progression."
          : `${nombreParents} parent${nombreParents > 1 ? "s suivent" : " suit"} ta progression.`}{" "}
        Pour lier un parent, donne-lui un code : il le saisira dans son espace parent.
      </p>
      {code ? (
        <div className="mt-3 rounded-lg bg-brand-wash p-4">
          <p className="text-sm text-gray-700">Code à donner à ton parent :</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-brand-dark" data-testid="code-liaison">
            {code.code}
          </p>
          <p className="mt-1 text-xs text-gray-600">Valable une seule fois, jusqu&apos;au {dateHeure(code.expireLe)}.</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={generer}
        disabled={enCours}
        className="mt-3 rounded-lg border border-brand-dark px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-wash disabled:opacity-60"
      >
        {code ? "Générer un nouveau code" : "Générer un code pour mon parent"}
      </button>
      {erreur ? (
        <div className="mt-3">
          <Alerte ton="erreur">{erreur}</Alerte>
        </div>
      ) : null}
    </section>
  );
}
