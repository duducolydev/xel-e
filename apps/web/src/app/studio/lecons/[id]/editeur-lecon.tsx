"use client";

import type { LeconStudio, QuizBrouillon, SectionLecon } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApercuLecon } from "@/components/apercu-lecon";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";
import { BadgeStatut, dateCourte } from "../../commun";
import { EditeurQuiz } from "../../editeur-quiz";

type Onglet = "redaction" | "apercu";

// Lignes vides retirées avant l'envoi : l'éditeur laisse taper librement, l'API valide le reste.
function nettoyerQuiz(quiz: QuizBrouillon): QuizBrouillon {
  return quiz.map((question) =>
    question.type === "REPONSE_COURTE"
      ? { ...question, reponsesAcceptees: question.reponsesAcceptees.map((r) => r.trim()).filter(Boolean) }
      : question,
  );
}

const classeChamp =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light";
const classeBoutonPrincipal =
  "rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60";
const classeBoutonSecondaire =
  "rounded-lg border border-brand-dark px-4 py-2.5 font-semibold text-brand-dark hover:bg-brand-wash disabled:cursor-not-allowed disabled:opacity-60";

export function EditeurLecon({ initiale }: { initiale: LeconStudio }) {
  const router = useRouter();
  const [lecon, setLecon] = useState(initiale);
  const [titre, setTitre] = useState(initiale.titre);
  const [contenu, setContenu] = useState(initiale.contenu);
  const [quiz, setQuiz] = useState<QuizBrouillon>(initiale.quiz);
  const [modifie, setModifie] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("redaction");
  const [apercu, setApercu] = useState<SectionLecon[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ton: "erreur" | "succes"; texte: string } | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const zoneTexte = useRef<HTMLTextAreaElement>(null);
  const verrouillee = !lecon.modifiable;

  const changer = <T,>(setter: (valeur: T) => void) => (valeur: T) => {
    setter(valeur);
    setModifie(true);
  };

  async function enregistrer(): Promise<boolean> {
    setEnCours("enregistrement");
    setMessage(null);
    const resultat = await envoyer<LeconStudio>(`/studio/lecons/${lecon.id}`, { titre, contenu, quiz: nettoyerQuiz(quiz) }, "PATCH");
    setEnCours(null);
    if (!resultat.ok) {
      setErreurs(resultat.erreurs);
      setMessage({ ton: "erreur", texte: resultat.message });
      return false;
    }
    setErreurs({});
    setLecon(resultat.donnees);
    setQuiz(resultat.donnees.quiz);
    setModifie(false);
    setMessage({ ton: "succes", texte: "Brouillon enregistré." });
    return true;
  }

  async function soumettre() {
    if (modifie && !(await enregistrer())) return;
    setEnCours("soumission");
    const resultat = await envoyer<LeconStudio>(`/studio/lecons/${lecon.id}/soumettre`);
    setEnCours(null);
    if (!resultat.ok) {
      setMessage({ ton: "erreur", texte: resultat.message });
      return;
    }
    setLecon(resultat.donnees);
    setMessage({ ton: "succes", texte: "Leçon soumise : l'équipe Xel-E va la relire." });
    router.refresh();
  }

  async function supprimer() {
    setEnCours("suppression");
    const resultat = await envoyer(`/studio/lecons/${lecon.id}`, undefined, "DELETE");
    if (resultat.ok) {
      router.push("/studio");
      router.refresh();
      return;
    }
    setEnCours(null);
    setMessage({ ton: "erreur", texte: resultat.message });
  }

  async function afficherApercu() {
    setOnglet("apercu");
    setApercu(null);
    const resultat = await envoyer<{ sections: SectionLecon[] }>("/studio/apercu", { contenu });
    if (resultat.ok) setApercu(resultat.donnees.sections);
    else setMessage({ ton: "erreur", texte: resultat.message });
  }

  async function insererImage(fichier: File) {
    const formulaire = new FormData();
    formulaire.append("fichier", fichier);
    setEnCours("image");
    const resultat = await envoyer<{ url: string }>("/studio/medias", formulaire);
    setEnCours(null);
    if (!resultat.ok) {
      setMessage({ ton: "erreur", texte: resultat.message });
      return;
    }
    const zone = zoneTexte.current;
    const position = zone?.selectionStart ?? contenu.length;
    const image = `\n![Description de l'image](${resultat.donnees.url})\n`;
    changer(setContenu)(contenu.slice(0, position) + image + contenu.slice(position));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {lecon.niveau} · {lecon.matiere} · {lecon.chapitre}
        </p>
        <BadgeStatut statut={lecon.statut} version={lecon.version} />
      </div>

      {lecon.statut === "EN_REVUE" ? (
        <Alerte ton="info">
          Leçon en revue depuis le {dateCourte(lecon.soumisLe ?? new Date().toISOString())} : elle est verrouillée
          jusqu&apos;à la décision de l&apos;administration.
        </Alerte>
      ) : null}
      {lecon.statut === "PUBLIE" ? (
        <Alerte ton="info">
          Cette leçon est en ligne. Toute modification crée un nouveau brouillon : la version publiée reste visible
          jusqu&apos;à la validation du nouveau texte.
        </Alerte>
      ) : null}

      {lecon.commentaires.length > 0 ? (
        <section aria-labelledby="titre-commentaires" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 id="titre-commentaires" className="font-semibold text-amber-900">
            Retours de l&apos;administration
          </h2>
          <ul className="mt-2 space-y-2">
            {lecon.commentaires.map((commentaire) => (
              <li key={commentaire.createdAt} className="text-sm text-amber-900">
                <span className="font-medium">{commentaire.auteur}</span>, le {dateCourte(commentaire.createdAt)} :{" "}
                {commentaire.contenu}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <fieldset disabled={verrouillee} className="space-y-6">
        <div>
          <label htmlFor="titre" className="mb-1 block text-sm font-medium text-gray-800">
            Titre
          </label>
          <input
            id="titre"
            value={titre}
            maxLength={150}
            onChange={(e) => changer(setTitre)(e.target.value)}
            aria-invalid={erreurs.titre ? true : undefined}
            className={classeChamp}
          />
          {erreurs.titre ? <p className="mt-1 text-sm text-red-700">{erreurs.titre}</p> : null}
        </div>

        <section aria-labelledby="titre-contenu" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titre-contenu" className="text-lg font-semibold text-gray-900">
              Cours
            </h2>
            <div role="tablist" aria-label="Mode d'affichage du cours" className="flex gap-1 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={onglet === "redaction"}
                onClick={() => setOnglet("redaction")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${onglet === "redaction" ? "bg-white text-brand-dark shadow" : "text-gray-700"}`}
              >
                Rédaction
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onglet === "apercu"}
                onClick={afficherApercu}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${onglet === "apercu" ? "bg-white text-brand-dark shadow" : "text-gray-700"}`}
              >
                Aperçu
              </button>
            </div>
          </div>

          {onglet === "redaction" ? (
            <div className="space-y-2">
              <label htmlFor="contenu" className="block text-sm font-medium text-gray-800">
                Contenu (Markdown)
              </label>
              <textarea
                id="contenu"
                ref={zoneTexte}
                rows={18}
                value={contenu}
                onChange={(e) => changer(setContenu)(e.target.value)}
                className={`${classeChamp} font-mono text-sm`}
                aria-describedby="aide-contenu"
              />
              <p id="aide-contenu" className="text-xs text-gray-500">
                « ## Titre » ouvre une nouvelle section · **gras** · *italique* · $a^2 + b^2 = c^2$ pour une formule ·
                $$…$$ pour une formule centrée.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-dark underline underline-offset-4">
                {enCours === "image" ? "Envoi de l'image…" : "Insérer une image (PNG, JPEG, GIF ou WebP, 2 Mo max.)"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    e.target.value = "";
                    if (fichier) void insererImage(fichier);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 p-5" aria-live="polite">
              {apercu ? <ApercuLecon sections={apercu} /> : <p className="text-sm text-gray-600">Préparation de l&apos;aperçu…</p>}
            </div>
          )}
        </section>

        <section aria-labelledby="titre-quiz" className="space-y-3">
          <h2 id="titre-quiz" className="text-lg font-semibold text-gray-900">
            Quiz
          </h2>
          <p className="text-xs text-gray-500">
            Le quiz est relu avec la leçon et mis en ligne en même temps qu&apos;elle, après validation.
          </p>
          <EditeurQuiz quiz={quiz} onChange={changer(setQuiz)} erreurs={erreurs} />
        </section>
      </fieldset>

      {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}

      {verrouillee ? null : (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
          <button type="button" onClick={enregistrer} disabled={enCours !== null} className={classeBoutonSecondaire}>
            {enCours === "enregistrement" ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button type="button" onClick={soumettre} disabled={enCours !== null} className={classeBoutonPrincipal}>
            {enCours === "soumission" ? "Envoi…" : "Soumettre à la revue"}
          </button>
          {modifie ? <span className="text-sm text-gray-600">Modifications non enregistrées</span> : null}
          {lecon.statut === "BROUILLON" && lecon.version === 0 ? (
            confirmerSuppression ? (
              <span className="ml-auto flex items-center gap-3 text-sm">
                Supprimer définitivement ce brouillon ?
                <button type="button" onClick={supprimer} disabled={enCours !== null} className="font-semibold text-red-700 underline">
                  Oui, supprimer
                </button>
                <button type="button" onClick={() => setConfirmerSuppression(false)} className="font-medium text-gray-700 underline">
                  Annuler
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmerSuppression(true)}
                className="ml-auto text-sm font-medium text-red-700 underline underline-offset-4"
              >
                Supprimer le brouillon
              </button>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
