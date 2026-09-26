import { z } from "zod";
import type { Niveau } from "./niveaux";

// Réponse d'un élève : identifiants de choix (QCM), booléen (vrai/faux), texte (réponse courte),
// ou null pour effacer.
export const reponseSchema = z.union([
  z.array(z.string().min(1).max(20)).max(20),
  z.boolean(),
  z.string().max(200, "La réponse ne doit pas dépasser 200 caractères."),
  z.null(),
]);
export type Reponse = z.infer<typeof reponseSchema>;

export const enregistrementReponseSchema = z.object({ reponse: reponseSchema });

export const positionSchema = z.object({ position: z.number().int().min(0) });

export type TypeQuestionQuiz = "QCM" | "VRAI_FAUX" | "REPONSE_COURTE";

export interface ChoixPublic {
  id: string;
  texte: string;
}

// Ce qui part vers le navigateur avant la soumission : aucune bonne réponse, aucune explication.
export interface QuestionPublique {
  id: string;
  type: TypeQuestionQuiz;
  enonce: string;
  bareme: number;
  choix?: ChoixPublic[];
  multiple?: boolean;
}

export interface QuizPublic {
  id: string;
  lecon: { slug: string; titre: string; niveau: Niveau; matiere: string };
  pointsTotal: number;
  questions: QuestionPublique[];
}

export interface EtatTentative {
  id: string;
  quizId: string;
  position: number;
  reponses: Record<string, Reponse>;
  demarreLe: string;
}

export type StatutQuestion = "correcte" | "partielle" | "incorrecte" | "sans-reponse";

export interface DetailCorrection {
  questionId: string;
  type: TypeQuestionQuiz;
  enonce: string;
  choix?: ChoixPublic[];
  reponseDonnee: Reponse;
  bonneReponse: string[] | boolean;
  statut: StatutQuestion;
  pointsObtenus: number;
  bareme: number;
  explication: string | null;
}

export interface ResultatTentative {
  id: string;
  lecon: { slug: string; titre: string; niveau: Niveau; matiere: string };
  score: number;
  pointsObtenus: number;
  pointsTotal: number;
  termineLe: string;
  details: DetailCorrection[];
}

export interface ResumeTentative {
  id: string;
  lecon: { slug: string; titre: string; niveau: Niveau; matiere: string };
  score: number | null;
  demarreLe: string;
  termineLe: string | null;
}

export const SEUIL_REUSSITE_QUIZ = 60;
