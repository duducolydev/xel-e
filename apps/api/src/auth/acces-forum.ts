import type { Role, StatutCompte } from "@prisma/client";
import { exigeConsentementParental } from "@xel-e/shared";

export interface ProfilAcces {
  role: Role;
  statutCompte: StatutCompte;
  email: string | null;
  emailConfirmeLe: Date | null;
  naissanceMois: number | null;
  naissanceAnnee: number | null;
  consentementParentalLe: Date | null;
}

export function consentementParentalRequis(profil: ProfilAcces, maintenant: Date): boolean {
  if (profil.role !== "ELEVE") return false;
  // Âge inconnu pour un élève : on applique la règle la plus protectrice.
  if (profil.naissanceMois === null || profil.naissanceAnnee === null) return true;
  return exigeConsentementParental(profil.naissanceMois, profil.naissanceAnnee, maintenant);
}

export function calculerAccesForum(profil: ProfilAcces, maintenant: Date): boolean {
  if (profil.statutCompte !== "ACTIF") return false;
  if (profil.email !== null && profil.emailConfirmeLe === null) return false;
  if (consentementParentalRequis(profil, maintenant) && profil.consentementParentalLe === null) {
    return false;
  }
  return true;
}

// Le forum est réservé aux élèves et aux professeurs (encadrés par l'administration) ; les parents
// suivent leurs enfants depuis l'espace parent.
export const ROLES_FORUM: readonly Role[] = ["ELEVE", "PROFESSEUR", "ADMIN"];

// null si le forum est ouvert à ce compte, sinon l'explication à afficher.
export function raisonFermetureForum(profil: ProfilAcces, maintenant: Date): string | null {
  if (!ROLES_FORUM.includes(profil.role)) return "Le forum est réservé aux élèves et aux professeurs.";
  if (profil.statutCompte !== "ACTIF") return "Ton compte n'est pas encore validé.";
  if (profil.email !== null && profil.emailConfirmeLe === null) {
    return "Confirme ton adresse email (lien reçu par email) pour accéder au forum.";
  }
  if (consentementParentalRequis(profil, maintenant) && profil.consentementParentalLe === null) {
    return "Le forum s'ouvrira dès que ton parent aura donné son accord. Tes cours restent accessibles.";
  }
  return null;
}
