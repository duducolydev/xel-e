"use client";

import {
  MAX_PIECES_JOINTES,
  type EtatForum,
  type Matiere,
  type Niveau,
  type PieceJointePublique,
  type SujetForumDetail,
} from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

const classeBouton =
  "rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60";
const classeZone =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light";

export function ChoixPseudonyme() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  async function valider(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const resultat = await envoyer<EtatForum>(
      "/forum/pseudonyme",
      { pseudonyme: new FormData(evenement.currentTarget).get("pseudonyme") },
      "PUT",
    );
    setEnCours(false);
    if (resultat.ok) router.refresh();
    else setErreur(resultat.erreurs.pseudonyme ?? resultat.message);
  }

  return (
    <section aria-labelledby="titre-pseudonyme" className="rounded-xl border border-brand-light bg-brand-wash p-5">
      <h2 id="titre-pseudonyme" className="font-semibold text-brand-dark">
        Choisis ton pseudonyme
      </h2>
      <p className="mt-1 text-sm text-gray-700">
        C&apos;est le seul nom affiché sur le forum : ni ton nom, ni ton email ne sont jamais montrés.
      </p>
      <form onSubmit={valider} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <Champ id="pseudonyme" label="Pseudonyme" erreur={erreur} aide="3 à 20 caractères : lettres sans accent, chiffres, « _ » ou « - »." maxLength={20} />
        <button type="submit" disabled={enCours} className={classeBouton}>
          {enCours ? "Enregistrement…" : "Valider"}
        </button>
      </form>
    </section>
  );
}

function taille(octets: number): string {
  return octets < 1024 * 1024 ? `${Math.ceil(octets / 1024)} Ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

// Sujet (avec titre) ou réponse : texte, pièces jointes analysées dès leur ajout, puis publication.
export function FormulaireMessage({
  sujetId,
  niveau,
  matiere,
}: {
  sujetId?: string;
  niveau?: Niveau;
  matiere?: Matiere;
}) {
  const router = useRouter();
  const nouveauSujet = !sujetId;
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [pieces, setPieces] = useState<PieceJointePublique[]>([]);
  const [enCours, setEnCours] = useState<"envoi" | "fichier" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  async function ajouterFichier(fichier: File) {
    const formulaire = new FormData();
    formulaire.append("fichier", fichier);
    setEnCours("fichier");
    setErreur(null);
    const resultat = await envoyer<PieceJointePublique>("/forum/pieces-jointes", formulaire);
    setEnCours(null);
    if (resultat.ok) setPieces((actuelles) => [...actuelles, resultat.donnees]);
    else setErreur(resultat.message);
  }

  async function publier(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours("envoi");
    setErreur(null);
    const corps = { contenu, piecesJointes: pieces.map((p) => p.id) };
    const resultat = nouveauSujet
      ? await envoyer<SujetForumDetail>("/forum/sujets", { ...corps, titre, niveau, matiere })
      : await envoyer<SujetForumDetail>(`/forum/sujets/${sujetId}/messages`, corps);
    setEnCours(null);
    if (!resultat.ok) {
      setErreurs(resultat.erreurs);
      setErreur(resultat.message);
      return;
    }
    setTitre("");
    setContenu("");
    setPieces([]);
    setErreurs({});
    if (nouveauSujet) router.push(`/forum/sujets/${resultat.donnees.id}`);
    else router.refresh();
  }

  const idContenu = nouveauSujet ? "contenu-sujet" : "contenu-reponse";
  return (
    <form onSubmit={publier} className="space-y-3" noValidate>
      {nouveauSujet ? (
        <Champ id="titre-sujet" label="Titre de ta question" value={titre} onChange={(e) => setTitre(e.target.value)} erreur={erreurs.titre} maxLength={120} />
      ) : null}
      <div>
        <label htmlFor={idContenu} className="mb-1 block text-sm font-medium text-gray-800">
          {nouveauSujet ? "Ton message" : "Ta réponse"}
        </label>
        <textarea
          id={idContenu}
          rows={5}
          maxLength={5000}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          aria-invalid={erreurs.contenu ? true : undefined}
          className={classeZone}
        />
      </div>
      <div className="space-y-2">
        {pieces.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {pieces.map((piece) => (
              <li key={piece.id} className="flex items-center gap-3">
                <span>
                  📎 {piece.nom} ({taille(piece.taille)})
                </span>
                <button
                  type="button"
                  onClick={() => setPieces((actuelles) => actuelles.filter((p) => p.id !== piece.id))}
                  className="font-medium text-red-700 underline"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {pieces.length < MAX_PIECES_JOINTES ? (
          <label className="inline-flex cursor-pointer text-sm font-medium text-brand-dark underline underline-offset-4">
            {enCours === "fichier" ? "Analyse antivirus en cours…" : "Joindre une image ou un PDF (5 Mo max.)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              className="sr-only"
              disabled={enCours !== null}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                e.target.value = "";
                if (fichier) void ajouterFichier(fichier);
              }}
            />
          </label>
        ) : null}
      </div>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      <button type="submit" disabled={enCours !== null} className={classeBouton}>
        {enCours === "envoi" ? "Publication…" : nouveauSujet ? "Publier ma question" : "Répondre"}
      </button>
    </form>
  );
}

// Signalement en un clic (motif facultatif) ; le message reste visible jusqu'au 3e signalement.
export function BoutonSignaler({ messageId, dejaSignale }: { messageId: string; dejaSignale: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [etat, setEtat] = useState<"attente" | "envoi" | "fait">(dejaSignale ? "fait" : "attente");
  const [erreur, setErreur] = useState<string | null>(null);

  if (etat === "fait") return <span className="text-xs text-gray-500">Signalé, merci.</span>;

  async function signaler() {
    setEtat("envoi");
    const resultat = await envoyer<{ masque: boolean }>(`/forum/messages/${messageId}/signaler`, motif ? { motif } : {});
    if (!resultat.ok) {
      setEtat("attente");
      setErreur(resultat.message);
      return;
    }
    setEtat("fait");
    if (resultat.donnees.masque) router.refresh();
  }

  return ouvert ? (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <label className="sr-only" htmlFor={`motif-${messageId}`}>
        Motif du signalement (facultatif)
      </label>
      <input
        id={`motif-${messageId}`}
        value={motif}
        maxLength={300}
        placeholder="Motif (facultatif)"
        onChange={(e) => setMotif(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1"
      />
      <button type="button" onClick={signaler} disabled={etat === "envoi"} className="font-semibold text-red-700 underline">
        Confirmer le signalement
      </button>
      <button type="button" onClick={() => setOuvert(false)} className="text-gray-600 underline">
        Annuler
      </button>
      {erreur ? <span className="text-red-700">{erreur}</span> : null}
    </span>
  ) : (
    <button type="button" onClick={() => setOuvert(true)} className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-red-700">
      Signaler
    </button>
  );
}
