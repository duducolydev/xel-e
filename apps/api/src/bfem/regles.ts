import type { LigneSimulation, Reponse } from "@xel-e/shared";

// --- Minuteur (le serveur fait foi) ---

export interface ReponseHorodatee {
  valeur: Reponse;
  // Instant (ISO) où le serveur a reçu la réponse.
  le: string;
}

export function calculerExpiration(demarreLe: Date, dureeSecondes: number): Date {
  return new Date(demarreLe.getTime() + dureeSecondes * 1000);
}

export function estExpiree(expireLe: Date, maintenant: Date): boolean {
  return maintenant.getTime() > expireLe.getTime();
}

// Seules comptent les réponses reçues au plus tard à l'instant limite (borne incluse) : une réponse
// arrivée après, même d'une seconde, est ignorée à la correction.
export function reponsesRetenues(reponses: Record<string, ReponseHorodatee>, expireLe: Date): Record<string, Reponse> {
  const retenues: Record<string, Reponse> = {};
  for (const [questionId, { valeur, le }] of Object.entries(reponses)) {
    if (new Date(le).getTime() <= expireLe.getTime()) retenues[questionId] = valeur;
  }
  return retenues;
}

// --- Notes et simulation de moyenne ---

const auCentieme = (valeur: number) => Math.round(valeur * 100) / 100;

// Note sur 20 arrondie au centième (ex. 13,5 points sur 17 → 15,88).
export function noteSur20(pointsObtenus: number, pointsTotal: number): number {
  if (pointsTotal <= 0) return 0;
  return auCentieme((pointsObtenus / pointsTotal) * 20);
}

// Mention indicative, sur le barème habituel (les règles officielles d'admission restent à confirmer).
export function mention(moyenne: number): string {
  if (moyenne >= 16) return "Très bien";
  if (moyenne >= 14) return "Bien";
  if (moyenne >= 12) return "Assez bien";
  if (moyenne >= 10) return "Passable";
  return "En dessous de la moyenne";
}

// Moyenne pondérée par les coefficients des épreuves qui ont une note, arrondie au centième
// (arrondi appliqué une seule fois, sur le résultat final).
export function simulerMoyenne(lignes: Pick<LigneSimulation, "coefficient" | "note">[]): {
  moyenne: number | null;
  coefficientsPris: number;
  coefficientsTotal: number;
  mention: string | null;
} {
  const notees = lignes.filter((l): l is { coefficient: number; note: number } => l.note !== null);
  const coefficientsPris = notees.reduce((total, l) => total + l.coefficient, 0);
  const coefficientsTotal = lignes.reduce((total, l) => total + l.coefficient, 0);
  if (coefficientsPris === 0) return { moyenne: null, coefficientsPris, coefficientsTotal, mention: null };
  const moyenne = auCentieme(notees.reduce((total, l) => total + l.note * l.coefficient, 0) / coefficientsPris);
  return { moyenne, coefficientsPris, coefficientsTotal, mention: mention(moyenne) };
}

// --- Accès premium ---

export interface AbonnementEtat {
  statut: "ACTIF" | "EXPIRE" | "ANNULE";
  expireLe: Date | null;
}

export function aUnAbonnementActif(abonnements: AbonnementEtat[], maintenant: Date): boolean {
  return abonnements.some((a) => a.statut === "ACTIF" && (a.expireLe === null || a.expireLe.getTime() > maintenant.getTime()));
}

// Contenu gratuit : ouvert à tous. Contenu premium : abonnement actif, ou administration.
export function peutAcceder(contenu: { premium: boolean }, lecteur: { role: string; abonne: boolean }): boolean {
  return !contenu.premium || lecteur.abonne || lecteur.role === "ADMIN";
}
