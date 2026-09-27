"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function DecisionRevue({ id, titre }: { id: string; titre: string }) {
  const router = useRouter();
  const [commentaire, setCommentaire] = useState("");
  const [enCours, setEnCours] = useState<"publier" | "rejeter" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurCommentaire, setErreurCommentaire] = useState<string | undefined>();

  async function decider(decision: "publier" | "rejeter") {
    setEnCours(decision);
    setErreur(null);
    const resultat = await envoyer(`/admin/lecons/${id}/${decision}`, decision === "rejeter" ? { commentaire } : undefined);
    if (resultat.ok) {
      router.push(`/admin/revue?decision=${decision === "publier" ? "publiee" : "refusee"}`);
      router.refresh();
      return;
    }
    setEnCours(null);
    setErreurCommentaire(resultat.erreurs.commentaire);
    setErreur(resultat.erreurs.commentaire ? null : resultat.message);
  }

  return (
    <section aria-labelledby="titre-decision" className="space-y-4 rounded-xl border border-brand-light bg-brand-wash p-5">
      <h2 id="titre-decision" className="text-lg font-semibold text-brand-dark">
        Décision
      </h2>
      <button
        type="button"
        onClick={() => decider("publier")}
        disabled={enCours !== null}
        className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60"
        aria-label={`Publier « ${titre} »`}
      >
        {enCours === "publier" ? "Publication…" : "Valider et publier"}
      </button>
      <div className="space-y-2 border-t border-brand-light pt-4">
        <label htmlFor="commentaire" className="block text-sm font-medium text-gray-800">
          Commentaire de refus (obligatoire pour renvoyer au professeur)
        </label>
        <textarea
          id="commentaire"
          rows={4}
          maxLength={2000}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          aria-invalid={erreurCommentaire ? true : undefined}
          aria-describedby={erreurCommentaire ? "commentaire-erreur" : undefined}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
        />
        {erreurCommentaire ? (
          <p id="commentaire-erreur" className="text-sm text-red-700">
            {erreurCommentaire}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => decider("rejeter")}
          disabled={enCours !== null}
          className="rounded-lg border border-red-700 bg-white px-4 py-2.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {enCours === "rejeter" ? "Envoi…" : "Refuser et renvoyer en brouillon"}
        </button>
      </div>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
    </section>
  );
}
