import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Role, StatutLecon } from "@prisma/client";

export type ActionLecon = "modifier" | "soumettre" | "rejeter" | "publier";

export interface Acteur {
  id: string;
  role: Role;
}

// Modifier une leçon publiée ouvre une nouvelle copie de travail : la version publiée reste en ligne.
const TRANSITIONS: Record<StatutLecon, Partial<Record<ActionLecon, StatutLecon>>> = {
  BROUILLON: { modifier: "BROUILLON", soumettre: "EN_REVUE" },
  EN_REVUE: { rejeter: "BROUILLON", publier: "PUBLIE" },
  PUBLIE: { modifier: "BROUILLON" },
};

const MESSAGES: Record<ActionLecon, string> = {
  modifier: "Une leçon en revue est verrouillée : attends la décision de l'administration.",
  soumettre: "Seule une leçon en brouillon peut être soumise à la revue.",
  rejeter: "Seule une leçon en revue peut être refusée.",
  publier: "Seule une leçon en revue peut être publiée.",
};

// Un professeur rédige et soumet ; seule l'administration publie ou refuse.
const ACTIONS_PAR_ROLE: Record<Role, readonly ActionLecon[]> = {
  ADMIN: ["modifier", "soumettre", "rejeter", "publier"],
  PROFESSEUR: ["modifier", "soumettre"],
  ELEVE: [],
  PARENT: [],
};

const REFUS_ROLE: Partial<Record<ActionLecon, string>> = {
  publier: "Un professeur ne peut pas publier directement : la leçon doit être validée par l'administration.",
  rejeter: "Seule l'administration peut refuser une leçon.",
};

export function appliquerAction(statut: StatutLecon, action: ActionLecon): StatutLecon {
  const suivant = TRANSITIONS[statut][action];
  if (!suivant) throw new ConflictException(MESSAGES[action]);
  return suivant;
}

// Un professeur ne voit et ne modifie que ses propres leçons (404 pour les autres : rien n'est révélé).
export function verifierAcces(acteur: Acteur, lecon: { auteurId: string | null }): void {
  if (acteur.role === "ADMIN") return;
  if (acteur.role !== "PROFESSEUR" || lecon.auteurId !== acteur.id) {
    throw new NotFoundException("Leçon introuvable.");
  }
}

export function verifierDroit(acteur: Acteur, action: ActionLecon, lecon: { auteurId: string | null }): void {
  verifierAcces(acteur, lecon);
  if (!ACTIONS_PAR_ROLE[acteur.role].includes(action)) {
    throw new ForbiddenException(REFUS_ROLE[action] ?? "Action non autorisée.");
  }
}

// Brouillons et versions en revue : visibles de l'administration et de leur auteur uniquement.
// Élèves, parents et visiteurs ne voient que la dernière version publiée.
export function peutVoirCopieDeTravail(acteur: Acteur | undefined, lecon: { auteurId: string | null }): boolean {
  if (!acteur) return false;
  return acteur.role === "ADMIN" || (acteur.role === "PROFESSEUR" && lecon.auteurId === acteur.id);
}

export interface EtatVisibilite {
  versionPublieeId: string | null;
  deletedAt: Date | null;
  chapitre: { deletedAt: Date | null };
}

export function estVisiblePublic(lecon: EtatVisibilite): boolean {
  return lecon.versionPublieeId !== null && lecon.deletedAt === null && lecon.chapitre.deletedAt === null;
}

export const FILTRE_LECONS_PUBLIQUES = {
  versionPublieeId: { not: null },
  deletedAt: null,
  chapitre: { deletedAt: null },
} as const;
