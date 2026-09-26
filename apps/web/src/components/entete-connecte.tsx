import Link from "next/link";
import type { UtilisateurCourant } from "@xel-e/shared";
import { BoutonDeconnexion } from "./bouton-deconnexion";

const LIBELLES_ROLE: Record<UtilisateurCourant["role"], string> = {
  ELEVE: "Élève",
  PROFESSEUR: "Professeur",
  PARENT: "Parent",
  ADMIN: "Administration",
};

export function EnteteConnecte({ utilisateur }: { utilisateur: UtilisateurCourant }) {
  return (
    <header className="bg-brand-dark text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/tableau-de-bord" className="text-xl font-bold tracking-tight">
          xel<span className="text-brand-light">-e</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-brand-light sm:inline">
            {LIBELLES_ROLE[utilisateur.role]}
          </span>
          {utilisateur.role === "ADMIN" ? (
            <Link href="/admin" className="text-sm font-medium underline-offset-4 hover:underline">
              Administration
            </Link>
          ) : null}
          <BoutonDeconnexion />
        </div>
      </div>
    </header>
  );
}
