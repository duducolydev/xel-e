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
