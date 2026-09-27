"use client";

import type { ChapitreStudio, LeconStudio } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ, Selection } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

// Les professeurs rédigent dans les chapitres existants : la structure du programme reste à l'équipe.
export function NouvelleLecon({ chapitres }: { chapitres: ChapitreStudio[] }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  async function creer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    setEnCours(true);
    const resultat = await envoyer<LeconStudio>("/studio/lecons", {
      chapitreId: donnees.get("chapitreId"),
      titre: donnees.get("titre"),
    });
    if (resultat.ok) {
      router.push(`/studio/lecons/${resultat.donnees.id}`);
      return;
    }
    setEnCours(false);
    setMessage(resultat.message);
    setErreurs(resultat.erreurs);
  }

  return (
    <section aria-labelledby="titre-nouvelle-lecon" className="rounded-xl border border-gray-200 p-5">
      <h2 id="titre-nouvelle-lecon" className="font-semibold text-gray-900">
        Nouvelle leçon
      </h2>
      <form onSubmit={creer} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
        <Selection id="chapitreId" label="Chapitre" erreur={erreurs.chapitreId} defaultValue="" required>
          <option value="" disabled>
            Choisis un chapitre
          </option>
          {chapitres.map((chapitre) => (
            <option key={chapitre.id} value={chapitre.id}>
              {chapitre.niveau} · {chapitre.matiere} · {chapitre.titre}
            </option>
          ))}
        </Selection>
        <Champ id="titre" label="Titre de la leçon" erreur={erreurs.titre} required maxLength={150} />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60"
        >
          {enCours ? "Création…" : "Créer le brouillon"}
        </button>
      </form>
      {message && Object.keys(erreurs).length === 0 ? (
        <div className="mt-3">
          <Alerte ton="erreur">{message}</Alerte>
        </div>
      ) : null}
    </section>
  );
}
