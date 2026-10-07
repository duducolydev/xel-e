"use client";

import type { TermeInterditDto } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

type Action = "restaurer" | "supprimer" | "supprimer-sujet";

export function ActionsModeration({ messageId, sujetId }: { messageId: string; sujetId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<Action | null>(null);
  const [confirmer, setConfirmer] = useState<Action | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function agir(action: Action) {
    setEnCours(action);
    const resultat =
      action === "restaurer"
        ? await envoyer(`/admin/moderation/messages/${messageId}/restaurer`)
        : action === "supprimer"
          ? await envoyer(`/admin/moderation/messages/${messageId}`, undefined, "DELETE")
          : await envoyer(`/admin/moderation/sujets/${sujetId}`, undefined, "DELETE");
    setEnCours(null);
    setConfirmer(null);
    if (resultat.ok) router.refresh();
    else setErreur(resultat.message);
  }

  const classe = "rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={enCours !== null} onClick={() => agir("restaurer")} className={`${classe} bg-brand-dark text-white hover:bg-brand`}>
        {enCours === "restaurer" ? "…" : "Innocenter et rétablir"}
      </button>
      {confirmer ? (
        <span className="flex items-center gap-2 text-sm">
          {confirmer === "supprimer" ? "Supprimer ce message ?" : "Supprimer tout le sujet ?"}
          <button type="button" disabled={enCours !== null} onClick={() => agir(confirmer)} className="font-semibold text-red-700 underline">
            Oui, supprimer
          </button>
          <button type="button" onClick={() => setConfirmer(null)} className="text-gray-700 underline">
            Annuler
          </button>
        </span>
      ) : (
        <>
          <button type="button" onClick={() => setConfirmer("supprimer")} className={`${classe} border border-red-700 text-red-700 hover:bg-red-50`}>
            Supprimer le message
          </button>
          <button type="button" onClick={() => setConfirmer("supprimer-sujet")} className={`${classe} text-red-700 underline`}>
            Supprimer le sujet
          </button>
        </>
      )}
      {erreur ? <span className="text-sm text-red-700">{erreur}</span> : null}
    </div>
  );
}

export function GestionTermes({ termes }: { termes: TermeInterditDto[] }) {
  const router = useRouter();
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function ajouter(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const resultat = await envoyer("/admin/moderation/termes", { terme: nouveau });
    setEnCours(false);
    if (!resultat.ok) {
      setErreur(resultat.erreurs.terme ?? resultat.message);
      return;
    }
    setErreur(null);
    setNouveau("");
    router.refresh();
  }

  async function retirer(id: string) {
    const resultat = await envoyer(`/admin/moderation/termes/${id}`, undefined, "DELETE");
    if (resultat.ok) router.refresh();
    else setErreur(resultat.message);
  }

  return (
    <section aria-labelledby="titre-termes" className="space-y-3">
      <h2 id="titre-termes" className="text-lg font-semibold text-gray-900">
        Termes interdits ({termes.length})
      </h2>
      <p className="text-sm text-gray-600">
        Un message contenant l&apos;un de ces termes (mot entier, sans tenir compte des accents ni des majuscules) est refusé
        avant publication. Ajoute ici les termes en wolof ou les nouvelles formes d&apos;insultes repérées.
      </p>
      <form onSubmit={ajouter} className="flex flex-wrap items-end gap-3" noValidate>
        <Champ id="nouveau-terme" label="Nouveau terme" value={nouveau} onChange={(e) => setNouveau(e.target.value)} maxLength={60} />
        <button type="submit" disabled={enCours} className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60">
          Ajouter
        </button>
      </form>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      <ul className="flex flex-wrap gap-2">
        {termes.map((terme) => (
          <li key={terme.id} className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm">
            {terme.terme}
            <button type="button" onClick={() => retirer(terme.id)} aria-label={`Retirer « ${terme.terme} »`} className="ml-1 font-bold text-gray-500 hover:text-red-700">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
