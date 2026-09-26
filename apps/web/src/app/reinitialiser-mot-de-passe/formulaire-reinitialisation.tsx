"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alerte, Bouton, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function FormulaireReinitialisation({ token }: { token: string | undefined }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);

  if (!token) {
    return (
      <Alerte ton="erreur">
        Ce lien est incomplet. Ouvre-le directement depuis l&apos;email reçu, ou{" "}
        <Link href="/mot-de-passe-oublie" className="underline">
          demande un nouveau lien
        </Link>
        .
      </Alerte>
    );
  }

  if (succes) {
    return (
      <div className="space-y-4">
        <Alerte ton="succes">{succes}</Alerte>
        <Link
          href="/connexion"
          className="block rounded-lg bg-brand-dark px-4 py-3 text-center font-semibold text-white hover:bg-brand"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  async function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = new FormData(evenement.currentTarget);
    if (formulaire.get("motDePasse") !== formulaire.get("confirmation")) {
      setErreurs({ confirmation: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setEnCours(true);
    setErreur(null);
    const resultat = await envoyer<{ message: string }>("/auth/reinitialiser-mot-de-passe", {
      token,
      motDePasse: formulaire.get("motDePasse"),
    });
    setEnCours(false);
    if (resultat.ok) {
      setSucces(resultat.donnees.message);
      return;
    }
    setErreur(resultat.message);
    setErreurs(resultat.erreurs);
  }

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      <Champ
        id="motDePasse"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        erreur={erreurs.motDePasse}
        aide="Au moins 8 caractères, avec au moins une lettre et un chiffre."
      />
      <Champ
        id="confirmation"
        label="Confirme le mot de passe"
        type="password"
        autoComplete="new-password"
        required
        erreur={erreurs.confirmation}
      />
      <Bouton type="submit" enCours={enCours}>
        Changer mon mot de passe
      </Bouton>
    </form>
  );
}
