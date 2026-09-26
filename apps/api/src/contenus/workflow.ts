import { ConflictException } from "@nestjs/common";
import type { Role, StatutLecon } from "@prisma/client";

export type ActionLecon = "modifier" | "soumettre" | "renvoyerEnBrouillon" | "publier";

// Modifier une leçon publiée ouvre une nouvelle copie de travail : la version publiée reste en ligne.
const TRANSITIONS: Record<StatutLecon, Partial<Record<ActionLecon, StatutLecon>>> = {
  BROUILLON: { modifier: "BROUILLON", soumettre: "EN_REVUE" },
  EN_REVUE: { renvoyerEnBrouillon: "BROUILLON", publier: "PUBLIE" },
  PUBLIE: { modifier: "BROUILLON" },
};

const MESSAGES: Record<ActionLecon, string> = {
  modifier: "Une leçon en revue est verrouillée : renvoie-la en brouillon pour la modifier.",
  soumettre: "Seule une leçon en brouillon peut être soumise à la revue.",
  renvoyerEnBrouillon: "Seule une leçon en revue peut être renvoyée en brouillon.",
  publier: "Seule une leçon en revue peut être publiée.",
};

export function appliquerAction(statut: StatutLecon, action: ActionLecon): StatutLecon {
  const suivant = TRANSITIONS[statut][action];
  if (!suivant) throw new ConflictException(MESSAGES[action]);
  return suivant;
}

// Les brouillons et versions en revue ne sont visibles que de l'administration (et, en Phase 6,
// de leur auteur). Élèves, parents et visiteurs ne voient que la dernière version publiée.
export function peutVoirCopieDeTravail(role: Role | undefined): boolean {
  return role === "ADMIN";
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
