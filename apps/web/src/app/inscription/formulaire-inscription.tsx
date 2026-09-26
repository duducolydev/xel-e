"use client";

import { exigeConsentementParental, NIVEAUX } from "@xel-e/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alerte, Bouton, Champ, Selection } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

type Profil = "eleve" | "professeur" | "parent";

const PROFILS: { valeur: Profil; libelle: string }[] = [
  { valeur: "eleve", libelle: "Élève" },
  { valeur: "professeur", libelle: "Professeur" },
  { valeur: "parent", libelle: "Parent" },
];

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

interface Confirmation {
  profil: Profil;
  avecEmail: boolean;
  consentementDemande: boolean;
}

function MessageConfirmation({ confirmation }: { confirmation: Confirmation }) {
  return (
    <div className="space-y-4">
      <Alerte ton="succes">Ton compte a bien été créé.</Alerte>
      <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
        {confirmation.avecEmail ? (
          <li>Un email de confirmation t&apos;a été envoyé : ouvre le lien qu&apos;il contient.</li>
        ) : null}
        {confirmation.consentementDemande ? (
          <li>
            Nous avons aussi écrit à ton parent. Le forum s&apos;ouvrira dès qu&apos;il aura donné son
            accord ; les cours sont déjà accessibles.
          </li>
        ) : null}
        {confirmation.profil === "professeur" ? (
          <li>
            Ton compte professeur doit être validé par l&apos;équipe Xel-E. Tu recevras un email dès
            qu&apos;il le sera.
          </li>
        ) : null}
      </ul>
      {confirmation.profil !== "professeur" ? (
        <Link
          href="/connexion"
          className="block rounded-lg bg-brand-dark px-4 py-3 text-center font-semibold text-white hover:bg-brand"
        >
          Se connecter
        </Link>
      ) : null}
    </div>
  );
}

export function FormulaireInscription() {
  const [profil, setProfil] = useState<Profil>("eleve");
  const [sansEmail, setSansEmail] = useState(false);
  const [mois, setMois] = useState("");
  const [annee, setAnnee] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const anneeValide = /^\d{4}$/.test(annee);
  const consentementRequis =
    profil === "eleve" &&
    mois !== "" &&
    anneeValide &&
    exigeConsentementParental(Number(mois), Number(annee), new Date());

  async function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const champs = Object.fromEntries(new FormData(evenement.currentTarget));
    setEnCours(true);
    setErreur(null);
    setErreurs({});

    const corps =
      profil === "eleve"
        ? {
            nomComplet: champs.nomComplet,
            email: sansEmail ? undefined : champs.email,
            identifiant: sansEmail ? champs.identifiant : undefined,
            niveau: champs.niveau,
            naissanceMois: champs.naissanceMois,
            naissanceAnnee: champs.naissanceAnnee,
            motDePasse: champs.motDePasse,
            contactParentEmail: consentementRequis ? champs.contactParentEmail : undefined,
          }
        : { nomComplet: champs.nomComplet, email: champs.email, motDePasse: champs.motDePasse };

    const resultat = await envoyer(`/auth/inscription/${profil}`, corps);
    setEnCours(false);
    if (resultat.ok) {
      setConfirmation({
        profil,
        avecEmail: !(profil === "eleve" && sansEmail),
        consentementDemande: consentementRequis,
      });
      return;
    }
    setErreur(resultat.message);
    setErreurs(resultat.erreurs);
  }

  if (confirmation) return <MessageConfirmation confirmation={confirmation} />;

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-800">Je suis</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {PROFILS.map((option) => (
            <label
              key={option.valeur}
              className={
                "cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition " +
                (profil === option.valeur
                  ? "border-brand-dark bg-brand-dark text-white"
                  : "border-gray-300 text-gray-700 hover:border-brand")
              }
            >
              <input
                type="radio"
                name="profil"
                value={option.valeur}
                checked={profil === option.valeur}
                onChange={() => {
                  setProfil(option.valeur);
                  setErreurs({});
                  setErreur(null);
                }}
                className="sr-only"
              />
              {option.libelle}
            </label>
          ))}
        </div>
      </fieldset>

      <form onSubmit={soumettre} noValidate className="space-y-4">
        {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}

        <Champ
          id="nomComplet"
          label="Nom complet"
          autoComplete="name"
          required
          erreur={erreurs.nomComplet}
          aide={profil === "eleve" ? "Il n'est jamais affiché publiquement." : undefined}
        />

        {profil === "eleve" ? (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sansEmail}
              onChange={(e) => setSansEmail(e.target.checked)}
              className="h-4 w-4 accent-brand-dark"
            />
            Je n&apos;ai pas d&apos;adresse email
          </label>
        ) : null}

        {profil === "eleve" && sansEmail ? (
          <Champ
            id="identifiant"
            label="Identifiant"
            autoComplete="username"
            autoCapitalize="none"
            required
            erreur={erreurs.identifiant}
            aide="Lettres sans accent, chiffres, « . », « _ » ou « - ». Tu t'en serviras pour te connecter."
          />
        ) : (
          <Champ
            id="email"
            label="Adresse email"
            type="email"
            autoComplete="email"
            required
            erreur={erreurs.email}
          />
        )}

        {profil === "eleve" ? (
          <>
            <Selection id="niveau" label="Classe" defaultValue="" required erreur={erreurs.niveau}>
              <option value="" disabled>
                Choisis ta classe
              </option>
              {NIVEAUX.map((niveau) => (
                <option key={niveau} value={niveau}>
                  {niveau}
                </option>
              ))}
            </Selection>

            <div className="grid grid-cols-2 gap-3">
              <Selection
                id="naissanceMois"
                label="Mois de naissance"
                value={mois}
                onChange={(e) => setMois(e.target.value)}
                required
                erreur={erreurs.naissanceMois}
              >
                <option value="" disabled>
                  Mois
                </option>
                {MOIS.map((nom, index) => (
                  <option key={nom} value={index + 1}>
                    {nom}
                  </option>
                ))}
              </Selection>
              <Champ
                id="naissanceAnnee"
                label="Année de naissance"
                inputMode="numeric"
                maxLength={4}
                placeholder="2012"
                value={annee}
                onChange={(e) => setAnnee(e.target.value.replace(/\D/g, ""))}
                required
                erreur={erreurs.naissanceAnnee}
              />
            </div>

            {consentementRequis ? (
              <div className="space-y-3 rounded-lg bg-brand-wash p-4">
                <p className="text-sm text-brand-dark">
                  Comme tu as moins de 15 ans, nous demandons l&apos;accord d&apos;un parent. Tu peux
                  suivre les cours tout de suite ; le forum s&apos;ouvrira après son accord.
                </p>
                <Champ
                  id="contactParentEmail"
                  label="Email d'un parent"
                  type="email"
                  autoComplete="off"
                  required
                  erreur={erreurs.contactParentEmail}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <Champ
          id="motDePasse"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          required
          erreur={erreurs.motDePasse}
          aide="Au moins 8 caractères, avec au moins une lettre et un chiffre."
        />

        <Bouton type="submit" enCours={enCours}>
          Créer mon compte
        </Bouton>
      </form>
    </div>
  );
}
