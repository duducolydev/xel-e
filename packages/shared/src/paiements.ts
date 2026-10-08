import { z } from "zod";

export const creerPaiementSchema = z.object({
  plan: z.string().min(1, "Choisis une offre."),
  fournisseur: z.string().min(1, "Choisis un moyen de paiement."),
  beneficiaireId: z.string().uuid("Élève inconnu.").optional(),
});
export type CreerPaiementDto = z.infer<typeof creerPaiementSchema>;

export const modifierPlanSchema = z.object({
  prixFcfa: z.coerce.number().int("Prix en francs CFA entiers.").min(100, "Prix trop bas.").max(1_000_000, "Prix trop élevé."),
  actif: z.boolean(),
});
export type ModifierPlanDto = z.infer<typeof modifierPlanSchema>;

export interface PlanDto {
  code: string;
  libelle: string;
  prixFcfa: number;
  dureeMois: number;
  aConfirmer: boolean;
}

export interface MoyenPaiement {
  code: string;
  libelle: string;
}

export interface EtatAbonnement {
  premium: boolean;
  // Fin de l'accès (périodes enchaînées comprises) ; si expiré, date de fin du dernier accès.
  jusquau: string | null;
  aRenouveler: boolean;
}

export type StatutPaiementDto = "EN_ATTENTE" | "CONFIRME" | "ECHOUE";

export interface PaiementDto {
  id: string;
  plan: { code: string; libelle: string };
  beneficiaire: string;
  fournisseur: string;
  montant: number;
  statut: StatutPaiementDto;
  creeLe: string;
  confirmeLe: string | null;
  numeroRecu: string | null;
}

export interface PageAbonnement {
  beneficiaire: { id: string; nomComplet: string };
  // Pour un parent : ses enfants liés (choix du bénéficiaire).
  enfants: { id: string; nomComplet: string }[];
  etat: EtatAbonnement;
  plans: PlanDto[];
  moyens: MoyenPaiement[];
  paiements: PaiementDto[];
}

// « 15 000 FCFA » (espace simple entre les milliers, identique sur tous les navigateurs et en PDF).
export function formaterFcfa(montant: number): string {
  const chiffres = String(Math.round(montant));
  const groupes: string[] = [];
  for (let fin = chiffres.length; fin > 0; fin -= 3) groupes.unshift(chiffres.slice(Math.max(0, fin - 3), fin));
  return groupes.join(" ") + " FCFA";
}
