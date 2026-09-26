"use client";

import type { EtatTentative, QuestionPublique, QuizPublic, Reponse } from "@xel-e/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

type Sauvegarde = "repos" | "encours" | "ok" | "erreur";

const DELAI_SAISIE_MS = 700;

const classeBoutonPrincipal =
  "rounded-lg bg-brand-dark px-5 py-2.5 font-semibold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60";

function estRepondue(reponse: Reponse | undefined): boolean {
  if (reponse === undefined || reponse === null) return false;
  if (Array.isArray(reponse)) return reponse.length > 0;
  if (typeof reponse === "string") return reponse.trim() !== "";
  return true;
}

function ChampsQuestion({
  question,
  reponse,
  onChoix,
  onTexte,
  onFinSaisie,
}: {
  question: QuestionPublique;
  reponse: Reponse | undefined;
  onChoix: (reponse: Reponse) => void;
  onTexte: (texte: string) => void;
  onFinSaisie: () => void;
}) {
  const classeOption =
    "flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3 text-base " +
    "has-[:checked]:border-brand-dark has-[:checked]:bg-brand-wash has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand";

  if (question.type === "QCM") {
    const cochees = Array.isArray(reponse) ? reponse : [];
    return (
      <div className="space-y-2">
        {question.choix?.map((choix) => (
          <label key={choix.id} className={classeOption}>
            <input
              type={question.multiple ? "checkbox" : "radio"}
              name={question.id}
              value={choix.id}
              checked={cochees.includes(choix.id)}
              onChange={(e) => {
                if (!question.multiple) return onChoix([choix.id]);
                onChoix(e.target.checked ? [...cochees, choix.id] : cochees.filter((id) => id !== choix.id));
              }}
              className="h-5 w-5 accent-brand-dark"
            />
            {choix.texte}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "VRAI_FAUX") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[
          { valeur: true, libelle: "Vrai" },
          { valeur: false, libelle: "Faux" },
        ].map((option) => (
          <label key={option.libelle} className={classeOption}>
            <input
              type="radio"
              name={question.id}
              checked={reponse === option.valeur}
              onChange={() => onChoix(option.valeur)}
              className="h-5 w-5 accent-brand-dark"
            />
            {option.libelle}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`reponse-${question.id}`} className="mb-1 block text-sm font-medium text-gray-800">
        Ta réponse
      </label>
      <input
        id={`reponse-${question.id}`}
        type="text"
        autoComplete="off"
        maxLength={200}
        value={typeof reponse === "string" ? reponse : ""}
        onChange={(e) => onTexte(e.target.value)}
        onBlur={onFinSaisie}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
      />
    </div>
  );
}

export function ParcoursQuiz({
  quiz,
  tentativeInitiale,
  cheminLecon,
}: {
  quiz: QuizPublic;
  tentativeInitiale: EtatTentative | null;
  cheminLecon: string;
}) {
  const router = useRouter();
  const [tentative, setTentative] = useState<EtatTentative | null>(tentativeInitiale);
  const [index, setIndex] = useState(tentativeInitiale?.position ?? 0);
  const [reponses, setReponses] = useState<Record<string, Reponse>>(tentativeInitiale?.reponses ?? {});
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerFin, setConfirmerFin] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const reprise = tentativeInitiale !== null && Object.keys(tentativeInitiale.reponses).length > 0;

  // Les envois partent dans l'ordre : une réponse plus ancienne n'écrase jamais une plus récente.
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const saisieEnAttente = useRef<{ questionId: string; minuteur: ReturnType<typeof setTimeout> } | null>(null);
  const titreQuestion = useRef<HTMLLegendElement>(null);
  const premierRendu = useRef(true);

  const question = quiz.questions[index];
  const total = quiz.questions.length;

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    titreQuestion.current?.focus();
  }, [index]);

  function mettreEnFile(appel: () => Promise<{ ok: boolean }>) {
    setSauvegarde("encours");
    const suivant = file.current.then(async () => {
      const resultat = await appel();
      setSauvegarde(resultat.ok ? "ok" : "erreur");
    });
    file.current = suivant;
    return suivant;
  }

  function enregistrer(questionId: string, reponse: Reponse) {
    if (!tentative) return;
    void mettreEnFile(() =>
      envoyer(`/quiz/tentatives/${tentative.id}/reponses/${questionId}`, { reponse }, "PUT"),
    );
  }

  function viderSaisieEnAttente(reponsesCourantes = reponses) {
    const attente = saisieEnAttente.current;
    if (!attente) return;
    clearTimeout(attente.minuteur);
    saisieEnAttente.current = null;
    enregistrer(attente.questionId, reponsesCourantes[attente.questionId] ?? null);
  }

  function choisir(questionId: string, reponse: Reponse) {
    setReponses((courantes) => ({ ...courantes, [questionId]: reponse }));
    enregistrer(questionId, reponse);
  }

  function saisir(questionId: string, texte: string) {
    const nouvelles = { ...reponses, [questionId]: texte };
    setReponses(nouvelles);
    if (saisieEnAttente.current) clearTimeout(saisieEnAttente.current.minuteur);
    saisieEnAttente.current = {
      questionId,
      minuteur: setTimeout(() => {
        saisieEnAttente.current = null;
        enregistrer(questionId, texte);
      }, DELAI_SAISIE_MS),
    };
  }

  function aller(nouvelIndex: number) {
    if (!tentative) return;
    viderSaisieEnAttente();
    setConfirmerFin(false);
    setIndex(nouvelIndex);
    void mettreEnFile(() => envoyer(`/quiz/tentatives/${tentative.id}/position`, { position: nouvelIndex }, "PUT"));
  }

  async function commencer() {
    setEnCours(true);
    setErreur(null);
    const resultat = await envoyer<EtatTentative>(`/quiz/lecons/${quiz.lecon.slug}/tentatives`);
    setEnCours(false);
    if (!resultat.ok) return setErreur(resultat.message);
    setTentative(resultat.donnees);
    setReponses(resultat.donnees.reponses);
    setIndex(resultat.donnees.position);
  }

  async function terminer() {
    if (!tentative) return;
    viderSaisieEnAttente();
    const sansReponse = quiz.questions.filter((q) => !estRepondue(reponses[q.id])).length;
    if (sansReponse > 0 && !confirmerFin) return setConfirmerFin(true);

    setEnCours(true);
    setErreur(null);
    await file.current;
    const resultat = await envoyer<{ id: string }>(`/quiz/tentatives/${tentative.id}/soumettre`);
    if (!resultat.ok) {
      setEnCours(false);
      return setErreur(resultat.message);
    }
    router.push(`/quiz/resultats/${resultat.donnees.id}`);
  }

  if (!tentative) {
    return (
      <div className="space-y-5">
        {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
        <p className="text-gray-700">
          {total} question{total > 1 ? "s" : ""} · {quiz.pointsTotal} point{quiz.pointsTotal > 1 ? "s" : ""}
        </p>
        <p className="text-gray-700">
          Tes réponses sont enregistrées au fur et à mesure : tu peux t&apos;arrêter et reprendre plus tard.
        </p>
        <button type="button" disabled={enCours} onClick={commencer} className={classeBoutonPrincipal}>
          {enCours ? "Un instant…" : "Commencer le quiz"}
        </button>
      </div>
    );
  }

  if (!question) return null;
  const sansReponse = quiz.questions.filter((q) => !estRepondue(reponses[q.id])).length;
  const messageSauvegarde = {
    repos: "",
    encours: "Enregistrement…",
    ok: "Réponse enregistrée.",
    erreur: "Réponse non enregistrée : vérifie ta connexion puis réponds à nouveau.",
  }[sauvegarde];

  return (
    <div className="space-y-5">
      {reprise ? <Alerte ton="info">Tu reprends là où tu t&apos;étais arrêté.</Alerte> : null}
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-600">
          Question {index + 1} sur {total} · {question.bareme} point{question.bareme > 1 ? "s" : ""}
        </p>
        <div
          role="progressbar"
          aria-label="Progression dans le quiz"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          className="h-2 overflow-hidden rounded-full bg-gray-200"
        >
          <div className="h-full bg-brand" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset className="space-y-4">
          <legend ref={titreQuestion} tabIndex={-1} className="text-lg font-semibold text-gray-900 outline-none">
            {question.enonce}
          </legend>
          {question.multiple ? <p className="text-sm text-gray-600">Plusieurs réponses possibles.</p> : null}
          <ChampsQuestion
            key={question.id}
            question={question}
            reponse={reponses[question.id]}
            onChoix={(reponse) => choisir(question.id, reponse)}
            onTexte={(texte) => saisir(question.id, texte)}
            onFinSaisie={() => viderSaisieEnAttente()}
          />
        </fieldset>
      </form>

      <p role="status" aria-live="polite" className={`min-h-5 text-sm ${sauvegarde === "erreur" ? "text-red-700" : "text-gray-500"}`}>
        {messageSauvegarde}
      </p>

      {confirmerFin ? (
        <Alerte ton="info">
          Il reste {sansReponse} question{sansReponse > 1 ? "s" : ""} sans réponse. Tu peux y revenir, ou terminer
          quand même.
        </Alerte>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5">
        <button
          type="button"
          onClick={() => aller(index - 1)}
          disabled={index === 0}
          className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:bg-brand-wash disabled:opacity-40"
        >
          ← Précédente
        </button>
        {index < total - 1 ? (
          <button type="button" onClick={() => aller(index + 1)} className={classeBoutonPrincipal}>
            Suivante →
          </button>
        ) : (
          <button type="button" disabled={enCours} onClick={terminer} className={classeBoutonPrincipal}>
            {enCours ? "Correction…" : confirmerFin ? "Terminer quand même" : "Terminer le quiz"}
          </button>
        )}
      </div>

      <p className="text-sm">
        <Link href={cheminLecon} className="text-brand-dark underline">
          Revoir la leçon
        </Link>
      </p>
    </div>
  );
}
