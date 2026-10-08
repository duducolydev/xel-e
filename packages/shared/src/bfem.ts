import { z } from "zod";
import type { DetailCorrection, QuestionPublique, Reponse } from "./quiz";
import { quizBrouillonSchema } from "./studio";

export const modifierEpreuveSchema = z.object({
  dureeMinutes: z.coerce
    .number()
    .int("Durée en minutes entières.")
    .min(10, "Durée trop courte.")
    .max(300, "Durée trop longue (5 h maximum).")
    .nullable(),
  coefficient: z.coerce.number().min(0.5, "Coefficient trop faible.").max(10, "Coefficient trop élevé."),
});
export type ModifierEpreuveDto = z.infer<typeof modifierEpreuveSchema>;

export const examenBlancSchema = z.object({
  titre: z.string().trim().min(5, "Le titre doit contenir au moins 5 caractères.").max(150, "Titre trop long."),
  epreuve: z.string().min(1, "Choisis une épreuve."),
  consignes: z.string().max(5000, "Consignes trop longues.").default(""),
  premium: z.boolean(),
  publie: z.boolean(),
  questions: quizBrouillonSchema.refine((questions) => questions.length > 0, "Ajoute au moins une question."),
});
export type ExamenBlancDto = z.infer<typeof examenBlancSchema>;

export const metaAnnaleSchema = z.object({
  epreuve: z.string().min(1, "Choisis une épreuve."),
  annee: z.coerce.number().int().min(1990, "Année invalide.").max(2100, "Année invalide."),
  titre: z.string().trim().min(3, "Titre trop court.").max(120, "Titre trop long."),
  premium: z.preprocess((v) => v === true || v === "true", z.boolean()),
});

export const estimationsSchema = z.object({
  // Note sur 20 estimée par l'élève, par code d'épreuve (null pour effacer).
  notes: z.record(z.string(), z.number().min(0, "Note entre 0 et 20.").max(20, "Note entre 0 et 20.").nullable()),
});
export type EstimationsDto = z.infer<typeof estimationsSchema>;

export const accorderAbonnementSchema = z.object({
  // Email ou identifiant du compte.
  login: z.string().trim().toLowerCase().min(1, "Indique l'email ou l'identifiant du compte."),
  jours: z.coerce.number().int().min(1, "Au moins 1 jour.").max(366, "Au plus 366 jours."),
});

export interface EpreuveDto {
  code: string;
  libelle: string;
  matiere: string | null;
  dureeMinutes: number | null;
  coefficient: number;
  aVerifier: boolean;
}

export interface AnnaleDto {
  id: string;
  epreuve: { code: string; libelle: string };
  annee: number;
  titre: string;
  aUnCorrige: boolean;
  premium: boolean;
  accessible: boolean;
}

export interface ExamenResume {
  slug: string;
  titre: string;
  epreuve: { code: string; libelle: string; aVerifier: boolean };
  dureeMinutes: number;
  nombreQuestions: number;
  pointsTotal: number;
  premium: boolean;
  accessible: boolean;
  derniereNote: number | null;
  copieEnCours: string | null;
}

export interface ExamenDetail extends ExamenResume {
  consignes: string;
}

export interface CopieEnCours {
  id: string;
  examen: { slug: string; titre: string; epreuve: string };
  questions: QuestionPublique[];
  reponses: Record<string, Reponse>;
  demarreLe: string;
  expireLe: string;
  // Heure du serveur à l'envoi : le navigateur corrige ainsi l'écart de son horloge.
  maintenant: string;
}

export interface ResultatCopie {
  id: string;
  examen: { slug: string; titre: string; epreuve: string };
  note: number;
  pointsObtenus: number;
  pointsTotal: number;
  soumissionAuto: boolean;
  demarreLe: string;
  soumiseLe: string;
  details: DetailCorrection[];
}

export type EtatCopie = ({ terminee: false } & CopieEnCours) | ({ terminee: true } & ResultatCopie);

export interface PointHistorique {
  copieId: string;
  examen: string;
  note: number;
  le: string;
  soumissionAuto: boolean;
}

export interface HistoriqueBfem {
  // Une série par épreuve, du plus ancien au plus récent.
  epreuves: { code: string; libelle: string; points: PointHistorique[] }[];
}

export interface LigneSimulation {
  code: string;
  libelle: string;
  coefficient: number;
  aVerifier: boolean;
  note: number | null;
  source: "examen" | "estimation" | null;
}

export interface SimulationBfem {
  lignes: LigneSimulation[];
  moyenne: number | null;
  coefficientsPris: number;
  coefficientsTotal: number;
  mention: string | null;
}

export interface ExamenAdmin {
  id: string;
  slug: string;
  titre: string;
  epreuve: string;
  consignes: string;
  premium: boolean;
  publie: boolean;
  questions: z.infer<typeof quizBrouillonSchema>;
}
