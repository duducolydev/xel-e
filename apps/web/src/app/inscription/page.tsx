import type { Metadata } from "next";
import Link from "next/link";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireInscription } from "./formulaire-inscription";

export const metadata: Metadata = { title: "Inscription — Xel-E" };

export default function PageInscription() {
  return (
    <CarteAuth
      titre="Créer un compte"
      sousTitre="Cours, exercices et quiz de Maths, PC et SVT, de la 6e à la 3e."
      pied={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-semibold text-brand-dark underline">
            Connecte-toi
          </Link>
        </>
      }
    >
      <FormulaireInscription />
    </CarteAuth>
  );
}
