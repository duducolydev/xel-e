"use client";

import type { EtatLeconEleve, ResultatLeconTerminee } from "@xel-e/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { envoyer, lire } from "@/lib/api-client";

type Etat =
  | { phase: "chargement" }
  | { phase: "anonyme" }
  | { phase: "a-faire" }
  | { phase: "envoi" }
  | { phase: "terminee"; resultat: ResultatLeconTerminee | null }
  | { phase: "erreur"; message: string };

// La page leçon reste publique et identique pour tous (référencement) : l'état de l'élève est lu ici.
export function BoutonTerminerLecon({ slug, cheminLecon }: { slug: string; cheminLecon: string }) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });

  useEffect(() => {
    let actif = true;
    void lire<EtatLeconEleve>(`/progression/lecons/${slug}`).then((resultat) => {
      if (!actif) return;
      if (resultat.ok) setEtat(resultat.donnees.terminee ? { phase: "terminee", resultat: null } : { phase: "a-faire" });
      else setEtat(resultat.statut === 401 ? { phase: "anonyme" } : { phase: "a-faire" });
    });
    return () => {
      actif = false;
    };
  }, [slug]);

  async function terminer() {
    setEtat({ phase: "envoi" });
    const resultat = await envoyer<ResultatLeconTerminee>(`/progression/lecons/${slug}/terminer`);
    if (resultat.ok) return setEtat({ phase: "terminee", resultat: resultat.donnees });
    setEtat(resultat.statut === 401 ? { phase: "anonyme" } : { phase: "erreur", message: resultat.message });
  }

  if (etat.phase === "chargement") return <div className="h-12" aria-hidden="true" />;

  if (etat.phase === "anonyme") {
    return (
      <p className="text-sm text-gray-700">
        <Link href={`/connexion?suite=${encodeURIComponent(cheminLecon)}`} className="font-semibold text-brand-dark underline">
          Connecte-toi
        </Link>{" "}
        pour enregistrer ta progression et gagner de l&apos;XP.
      </p>
    );
  }

  if (etat.phase === "terminee") {
    const { resultat } = etat;
    return (
      <div role="status" className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
        <p className="font-semibold">
          <span aria-hidden="true">✓ </span>Leçon terminée{resultat && resultat.xp > 0 ? ` : +${resultat.xp} XP` : ""}
        </p>
        {resultat?.badges.map((badge) => (
          <p key={badge.code} className="text-sm">
            Nouveau badge : <strong>{badge.libelle}</strong> — {badge.description}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {etat.phase === "erreur" ? (
        <p role="alert" className="text-sm text-red-700">
          {etat.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={terminer}
        disabled={etat.phase === "envoi"}
        className="rounded-lg bg-brand-dark px-5 py-3 font-semibold text-white hover:bg-brand disabled:opacity-60"
      >
        {etat.phase === "envoi" ? "Enregistrement…" : "J'ai terminé cette leçon"}
      </button>
    </div>
  );
}
