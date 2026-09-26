"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function ReglageClassement({ participe, pseudonyme }: { participe: boolean; pseudonyme: string | null }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  async function regler(corps: { actif: true; pseudonyme: string } | { actif: false }) {
    setEnCours(true);
    setErreur(null);
    const resultat = await envoyer("/progression/classement", corps, "PUT");
    setEnCours(false);
    if (resultat.ok) {
      setErreurs({});
      router.refresh();
      return;
    }
    setErreur(resultat.message);
    setErreurs(resultat.erreurs);
  }

  if (participe) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
        <p className="text-sm text-gray-700">
          Tu apparais sous le pseudonyme <strong>{pseudonyme}</strong>.
        </p>
        <button
          type="button"
          disabled={enCours}
          onClick={() => regler({ actif: false })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-wash disabled:opacity-60"
        >
          Me retirer du classement
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border border-gray-200 p-4"
      onSubmit={(evenement: FormEvent<HTMLFormElement>) => {
        evenement.preventDefault();
        void regler({ actif: true, pseudonyme: String(new FormData(evenement.currentTarget).get("pseudonyme") ?? "") });
      }}
    >
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      <p className="text-sm text-gray-700">
        Le classement est facultatif. Tu y apparais uniquement sous un pseudonyme, jamais sous ton nom, et tu peux te
        retirer quand tu veux.
      </p>
      <Champ
        id="pseudonyme"
        label="Choisis ton pseudonyme"
        defaultValue={pseudonyme ?? ""}
        autoComplete="off"
        maxLength={20}
        erreur={erreurs.pseudonyme}
        aide="3 à 20 caractères : lettres sans accent, chiffres, « _ » ou « - ». Évite ton vrai nom."
      />
      <button
        type="submit"
        disabled={enCours}
        className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60"
      >
        {enCours ? "Un instant…" : "Participer au classement"}
      </button>
    </form>
  );
}
