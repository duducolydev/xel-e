import { z } from "zod";
import { MATIERES, type InfoMatiere } from "./matieres";
import { NIVEAUX, type Niveau } from "./niveaux";
import { pseudonymeSchema } from "./progression";

export const MAX_PIECES_JOINTES = 3;
export const TAILLE_MAX_PIECE_JOINTE = 5 * 1024 * 1024;
export const SEUIL_MASQUAGE = 3;

const contenuSchema = z
  .string()
  .trim()
  .min(2, "Ton message est vide.")
  .max(5000, "Ton message ne doit pas dépasser 5 000 caractères.");
const piecesJointesSchema = z
  .array(z.string().uuid("Pièce jointe invalide."))
  .max(MAX_PIECES_JOINTES, `Au plus ${MAX_PIECES_JOINTES} pièces jointes par message.`)
  .default([]);

export const creerSujetSchema = z.object({
  niveau: z.enum(NIVEAUX, { errorMap: () => ({ message: "Niveau inconnu." }) }),
  matiere: z.enum(MATIERES, { errorMap: () => ({ message: "Matière inconnue." }) }),
  titre: z
    .string()
    .trim()
    .min(5, "Le titre doit contenir au moins 5 caractères.")
    .max(120, "Le titre ne doit pas dépasser 120 caractères."),
  contenu: contenuSchema,
  piecesJointes: piecesJointesSchema,
});
export type CreerSujetDto = z.infer<typeof creerSujetSchema>;

export const repondreSchema = z.object({ contenu: contenuSchema, piecesJointes: piecesJointesSchema });
export type RepondreDto = z.infer<typeof repondreSchema>;

export const signalementSchema = z.object({
  motif: z.string().trim().max(300, "Le motif ne doit pas dépasser 300 caractères.").optional(),
});
export type SignalementDto = z.infer<typeof signalementSchema>;

export const pseudonymeForumSchema = z.object({ pseudonyme: pseudonymeSchema });

export const termeInterditSchema = z.object({
  terme: z
    .string()
    .trim()
    .min(2, "Le terme doit contenir au moins 2 caractères.")
    .max(60, "Le terme ne doit pas dépasser 60 caractères."),
});

// Ce qui est montré publiquement d'un auteur : son pseudonyme et son rôle, jamais son nom ni son email.
export type BadgeForum = "PROFESSEUR" | "EQUIPE" | null;

export interface AuteurPublic {
  pseudonyme: string;
  badge: BadgeForum;
}

export interface PieceJointePublique {
  id: string;
  nom: string;
  type: string;
  taille: number;
}

export type EtatMessage = "visible" | "masque" | "supprime";

export interface MessagePublic {
  id: string;
  etat: EtatMessage;
  // null quand le message est masqué ou supprimé (sauf pour son auteur, qui voit son texte masqué).
  contenu: string | null;
  auteur: AuteurPublic;
  createdAt: string;
  piecesJointes: PieceJointePublique[];
  estMoi: boolean;
  signaleParMoi: boolean;
}

export interface ResumeSujet {
  id: string;
  titre: string;
  auteur: AuteurPublic;
  nombreReponses: number;
  dernierMessageLe: string;
  createdAt: string;
}

export interface PageForum {
  niveau: Niveau;
  matiere: InfoMatiere;
  sujets: ResumeSujet[];
}

export interface SujetForumDetail {
  id: string;
  titre: string;
  niveau: Niveau;
  matiere: InfoMatiere;
  auteur: AuteurPublic;
  messages: MessagePublic[];
}

export interface EtatForum {
  acces: boolean;
  // Explication affichée quand le forum est fermé à ce compte.
  raison: string | null;
  pseudonyme: string | null;
  niveau: Niveau | null;
  liensAutorises: boolean;
}

export interface ElementModeration {
  messageId: string;
  sujet: { id: string; titre: string };
  contenu: string;
  // Identité réelle visible de l'administration seule, pour pouvoir agir (compte, parents).
  auteur: { pseudonyme: string | null; nomComplet: string; role: string };
  etat: EtatMessage;
  verifie: boolean;
  signalements: number;
  motifs: string[];
  dernierSignalementLe: string;
  piecesJointes: PieceJointePublique[];
}

export interface TermeInterditDto {
  id: string;
  terme: string;
}
