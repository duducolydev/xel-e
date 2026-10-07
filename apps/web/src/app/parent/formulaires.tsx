"use client";

import type { EnfantLie, FrequenceResume, PreferencesParent } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

const classeBouton = "rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60";

export function FormulaireLiaison() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ton: "erreur" | "succes"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function lier(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const resultat = await envoyer<EnfantLie>("/parents/liaison", { code });
    setEnCours(false);
    if (!resultat.ok) {
      setMessage({ ton: "erreur", texte: resultat.erreurs.code ?? resultat.message });
      return;
    }
    setCode("");
    setMessage({ ton: "succes", texte: `${resultat.donnees.nomComplet} est maintenant lié(e) à votre compte.` });
    router.refresh();
  }

  return (
    <form onSubmit={lier} className="space-y-3 rounded-xl border border-gray-200 p-4" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <Champ
          id="code-enfant"
          label="Code donné par votre enfant"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ex. K7PM-3XQ9"
          autoComplete="off"
          className="min-w-56"
        />
        <button type="submit" disabled={enCours} className={classeBouton}>
          {enCours ? "Vérification…" : "Lier cet enfant"}
        </button>
      </div>
      {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
    </form>
  );
}

const FREQUENCES: { valeur: FrequenceResume; libelle: string }[] = [
  { valeur: "HEBDOMADAIRE", libelle: "Chaque semaine (dimanche à 18 h)" },
  { valeur: "MENSUELLE", libelle: "Chaque mois (le 1er à 18 h)" },
  { valeur: "AUCUNE", libelle: "Ne pas recevoir de résumé" },
];

export function FormulairePreferences({ initiales }: { initiales: PreferencesParent }) {
  const [preferences, setPreferences] = useState({ ...initiales, telephone: initiales.telephone ?? "" });
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ton: "erreur" | "succes"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const changer = (champ: Partial<typeof preferences>) => setPreferences((actuelles) => ({ ...actuelles, ...champ }));

  async function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const resultat = await envoyer<PreferencesParent>("/parents/preferences", preferences, "PUT");
    setEnCours(false);
    if (!resultat.ok) {
      setErreurs(resultat.erreurs);
      setMessage({ ton: "erreur", texte: resultat.message });
      return;
    }
    setErreurs({});
    setMessage({ ton: "succes", texte: "Vos préférences sont enregistrées." });
  }

  const aucune = preferences.frequence === "AUCUNE";
  return (
    <section aria-labelledby="titre-preferences" className="rounded-xl border border-gray-200 p-5">
      <h2 id="titre-preferences" className="font-semibold text-gray-900">
        Résumé d&apos;activité
      </h2>
      <form onSubmit={enregistrer} className="mt-3 space-y-4" noValidate>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800">Fréquence</legend>
          {FREQUENCES.map(({ valeur, libelle }) => (
            <label key={valeur} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="frequence"
                checked={preferences.frequence === valeur}
                onChange={() => changer({ frequence: valeur })}
                className="h-4 w-4 accent-brand-dark"
              />
              {libelle}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2" disabled={aucune}>
          <legend className="text-sm font-medium text-gray-800">Recevoir aussi le résumé par</legend>
          <p className="text-xs text-gray-500">Il est toujours visible dans cet espace.</p>
          {(
            [
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
              ["sms", "SMS"],
            ] as const
          ).map(([champ, libelle]) => (
            <label key={champ} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences[champ]}
                onChange={(e) => changer({ [champ]: e.target.checked })}
                className="h-4 w-4 accent-brand-dark"
              />
              {libelle}
            </label>
          ))}
          {preferences.whatsapp || preferences.sms ? (
            <Champ
              id="telephone"
              label="Numéro de téléphone"
              type="tel"
              value={preferences.telephone}
              onChange={(e) => changer({ telephone: e.target.value })}
              erreur={erreurs.telephone}
              placeholder="+221 77 123 45 67"
              className="max-w-xs"
            />
          ) : null}
        </fieldset>
        {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
        <button type="submit" disabled={enCours} className={classeBouton}>
          {enCours ? "Enregistrement…" : "Enregistrer mes préférences"}
        </button>
      </form>
    </section>
  );
}
