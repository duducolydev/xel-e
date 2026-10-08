"use client";

import type { CopieEnCours, QuestionPublique, Reponse } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

type Enregistrement = "enregistre" | "en-cours" | "erreur";

function formaterTemps(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secondes = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secondes).padStart(2, "0");
  return heures > 0 ? `${heures}:${mm}:${ss}` : `${mm}:${ss}`;
}

const classeChamp =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light";

function ChampQuestion({
  question,
  valeur,
  changer,
}: {
  question: QuestionPublique;
  valeur: Reponse | undefined;
  changer: (reponse: Reponse, immediat: boolean) => void;
}) {
  if (question.type === "QCM") {
    const cochees = Array.isArray(valeur) ? valeur : [];
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Choix pour : {question.enonce}</legend>
        {question.multiple ? <p className="text-xs text-gray-500">Plusieurs réponses possibles.</p> : null}
        {question.choix?.map((choix) => (
          <label key={choix.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-brand-wash">
            <input
              type={question.multiple ? "checkbox" : "radio"}
              name={`question-${question.id}`}
              checked={cochees.includes(choix.id)}
              onChange={(e) => {
                const suivantes = question.multiple
                  ? e.target.checked
                    ? [...cochees, choix.id]
                    : cochees.filter((id) => id !== choix.id)
                  : [choix.id];
                changer(suivantes, true);
              }}
              className="h-4 w-4 accent-brand-dark"
            />
            {choix.texte}
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.type === "VRAI_FAUX") {
    return (
      <div className="flex gap-3" role="radiogroup" aria-label={`Vrai ou faux : ${question.enonce}`}>
        {[true, false].map((option) => (
          <label key={String(option)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 hover:bg-brand-wash">
            <input
              type="radio"
              name={`question-${question.id}`}
              checked={valeur === option}
              onChange={() => changer(option, true)}
              className="h-4 w-4 accent-brand-dark"
            />
            {option ? "Vrai" : "Faux"}
          </label>
        ))}
      </div>
    );
  }
  return (
    <input
      type="text"
      aria-label={`Réponse à : ${question.enonce}`}
      value={typeof valeur === "string" ? valeur : ""}
      onChange={(e) => changer(e.target.value, false)}
      onBlur={(e) => changer(e.target.value, true)}
      className={classeChamp}
      autoComplete="off"
    />
  );
}

export function PassageExamen({ copie }: { copie: CopieEnCours }) {
  const router = useRouter();
  const [reponses, setReponses] = useState<Record<string, Reponse>>(copie.reponses);
  const [etats, setEtats] = useState<Record<string, Enregistrement>>({});
  const [restantMs, setRestantMs] = useState(() => new Date(copie.expireLe).getTime() - new Date(copie.maintenant).getTime());
  const [confirmer, setConfirmer] = useState(false);
  const [fin, setFin] = useState<"auto" | "manuelle" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuteries = useRef<Record<string, number>>({});
  // Écart entre l'horloge du serveur et celle du navigateur, mesuré au chargement.
  const ecart = useRef(new Date(copie.maintenant).getTime() - Date.now());

  const enregistrer = useCallback(
    async (questionId: string, reponse: Reponse) => {
      setEtats((actuels) => ({ ...actuels, [questionId]: "en-cours" }));
      const resultat = await envoyer(`/bfem/copies/${copie.id}/reponses/${questionId}`, { reponse }, "PUT");
      if (resultat.ok) {
        setEtats((actuels) => ({ ...actuels, [questionId]: "enregistre" }));
        return;
      }
      setEtats((actuels) => ({ ...actuels, [questionId]: "erreur" }));
      // Temps écoulé côté serveur : la copie est déjà rendue.
      if (resultat.statut === 409) router.replace(`/bfem/copies/${copie.id}/resultat`);
      else setErreur(resultat.message);
    },
    [copie.id, router],
  );

  const changer = (questionId: string) => (reponse: Reponse, immediat: boolean) => {
    setReponses((actuelles) => ({ ...actuelles, [questionId]: reponse }));
    window.clearTimeout(minuteries.current[questionId]);
    if (immediat) void enregistrer(questionId, reponse);
    else minuteries.current[questionId] = window.setTimeout(() => void enregistrer(questionId, reponse), 800);
  };

  const rendre = useCallback(
    async (mode: "auto" | "manuelle") => {
      setFin(mode);
      await envoyer(`/bfem/copies/${copie.id}/soumettre`);
      // Même si la copie a déjà été rendue par le serveur (fin du temps), le résultat existe.
      router.replace(`/bfem/copies/${copie.id}/resultat`);
    },
    [copie.id, router],
  );

  useEffect(() => {
    const expiration = new Date(copie.expireLe).getTime();
    const minuterie = window.setInterval(() => {
      const restant = expiration - (Date.now() + ecart.current);
      setRestantMs(restant);
      if (restant <= 0) {
        window.clearInterval(minuterie);
        void rendre("auto");
      }
    }, 250);
    return () => window.clearInterval(minuterie);
  }, [copie.expireLe, rendre]);

  // Annonce vocale seulement aux moments clés (pas à chaque seconde).
  const minutesRestantes = Math.ceil(restantMs / 60_000);
  const annonce = minutesRestantes === 5 || minutesRestantes === 1 ? `Il reste ${minutesRestantes} minute${minutesRestantes > 1 ? "s" : ""}.` : "";

  const repondues = copie.questions.filter((q) => {
    const valeur = reponses[q.id];
    return valeur !== undefined && valeur !== null && valeur !== "" && !(Array.isArray(valeur) && valeur.length === 0);
  }).length;
  const urgent = restantMs <= 5 * 60_000;

  if (fin) {
    return (
      <div className="py-10" role="status">
        <p className="text-center text-lg font-semibold text-brand-dark">
          {fin === "auto" ? "Temps écoulé : ta copie est rendue automatiquement…" : "Copie rendue, correction en cours…"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">{copie.examen.epreuve}</p>
            <h1 className="font-bold text-brand-dark">{copie.examen.titre}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-600">Temps restant</p>
            <p role="timer" aria-label="Temps restant" className={`font-mono text-2xl font-bold ${urgent ? "text-red-700" : "text-brand-dark"}`} data-testid="minuteur">
              {formaterTemps(restantMs)}
            </p>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          {repondues} / {copie.questions.length} questions répondues · réponses enregistrées au fur et à mesure
        </p>
        <p className="sr-only" aria-live="polite">
          {annonce}
        </p>
      </div>

      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}

      <ol className="space-y-4">
        {copie.questions.map((question, index) => (
          <li key={question.id} className="space-y-3 rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-gray-900">
                {index + 1}. {question.enonce}
              </p>
              <span className="shrink-0 text-xs text-gray-500">
                {question.bareme} pt{question.bareme > 1 ? "s" : ""}
              </span>
            </div>
            <ChampQuestion question={question} valeur={reponses[question.id]} changer={changer(question.id)} />
            <p className="text-xs text-gray-500" aria-live="polite">
              {etats[question.id] === "en-cours" ? "Enregistrement…" : null}
              {etats[question.id] === "enregistre" ? "Enregistré" : null}
              {etats[question.id] === "erreur" ? "Non enregistré" : null}
            </p>
          </li>
        ))}
      </ol>

      <div className="border-t border-gray-200 pt-5">
        {confirmer ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-800">
              Rendre ta copie maintenant ? {repondues < copie.questions.length ? `${copie.questions.length - repondues} question(s) sans réponse.` : ""}
            </span>
            <button type="button" onClick={() => void rendre("manuelle")} className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand">
              Oui, rendre ma copie
            </button>
            <button type="button" onClick={() => setConfirmer(false)} className="font-medium text-gray-700 underline">
              Continuer
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmer(true)} className="rounded-lg bg-brand-dark px-5 py-3 font-semibold text-white hover:bg-brand">
            Rendre ma copie
          </button>
        )}
      </div>
    </div>
  );
}
