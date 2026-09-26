import type { Metadata } from "next";
import Link from "next/link";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion — Xel-E" };

// N'accepte qu'un chemin interne : pas de redirection vers un autre site après connexion.
function cheminSur(suite: string | string[] | undefined): string {
  if (typeof suite === "string" && suite.startsWith("/") && !suite.startsWith("//")) return suite;
  return "/tableau-de-bord";
}

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { suite } = await searchParams;
  return (
    <CarteAuth
      titre="Connexion"
      sousTitre="Content de te revoir ! Connecte-toi pour reprendre tes cours."
      pied={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-semibold text-brand-dark underline">
            Inscris-toi
          </Link>
        </>
      }
    >
      <FormulaireConnexion suite={cheminSur(suite)} />
      <p className="mt-4 text-center text-sm">
        <Link href="/mot-de-passe-oublie" className="text-brand-dark underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </CarteAuth>
  );
}
