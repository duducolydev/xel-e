"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Bouton, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export function FormulaireConnexion({ suite }: { suite: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  async function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = new FormData(evenement.currentTarget);
    setEnCours(true);
    setErreur(null);
    const resultat = await envoyer("/auth/connexion", {
      login: formulaire.get("login"),
      motDePasse: formulaire.get("motDePasse"),
    });
    if (resultat.ok) {
      router.replace(suite);
      router.refresh();
      return;
    }
    setEnCours(false);
    setErreur(resultat.message);
    setErreurs(resultat.erreurs);
  }

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      <Champ
        id="login"
        label="Email ou identifiant"
        autoComplete="username"
        autoCapitalize="none"
        required
        erreur={erreurs.login}
      />
      <Champ
        id="motDePasse"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
        erreur={erreurs.motDePasse}
      />
      <Bouton type="submit" enCours={enCours}>
        Se connecter
      </Bouton>
    </form>
  );
}
