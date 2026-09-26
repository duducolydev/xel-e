"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CarteAuth } from "@/components/carte-auth";
import { Alerte, Bouton, Champ } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

export default function PageMotDePasseOublie() {
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: "succes" | "erreur"; texte: string } | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  async function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const resultat = await envoyer<{ message: string }>("/auth/mot-de-passe-oublie", {
      login: new FormData(evenement.currentTarget).get("login"),
    });
    setEnCours(false);
    setErreurs(resultat.ok ? {} : resultat.erreurs);
    setMessage(
      resultat.ok
        ? { ton: "succes", texte: resultat.donnees.message }
        : { ton: "erreur", texte: resultat.message },
    );
  }

  return (
    <CarteAuth
      titre="Mot de passe oublié"
      sousTitre="Indique ton email ou ton identifiant : nous t'enverrons un lien pour en choisir un nouveau."
      pied={
        <Link href="/connexion" className="font-semibold text-brand-dark underline">
          Retour à la connexion
        </Link>
      }
    >
      {message?.ton === "succes" ? (
        <Alerte ton="succes">{message.texte}</Alerte>
      ) : (
        <form onSubmit={soumettre} noValidate className="space-y-4">
          {message ? <Alerte ton="erreur">{message.texte}</Alerte> : null}
          <Champ
            id="login"
            label="Email ou identifiant"
            autoComplete="username"
            autoCapitalize="none"
            required
            erreur={erreurs.login}
          />
          <Bouton type="submit" enCours={enCours}>
            Envoyer le lien
          </Bouton>
        </form>
      )}
    </CarteAuth>
  );
}
