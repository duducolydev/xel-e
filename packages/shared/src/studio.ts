import { z } from "zod";
import type { Niveau } from "./niveaux";
import type { NotificationEleve } from "./progression";

const enonceSchema = z
  .string()
  .trim()
  .min(3, "L'énoncé doit contenir au moins 3 caractères.")
  .max(500, "L'énoncé ne doit pas dépasser 500 caractères.");
const baremeSchema = z.coerce
  .number()
  .int("Le barème doit être un nombre entier.")
  .min(1, "Le barème doit valoir au moins 1 point.")
  .max(10, "Le barème ne doit pas dépasser 10 points.");
const explicationSchema = z
  .string()
  .trim()
  .max(1000, "L'explication ne doit pas dépasser 1 000 caractères.")
  .optional()
  .transform((texte) => (texte ? texte : undefined));
const idQuestionSchema = z.string().uuid().optional();

export const choixBrouillonSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,8}$/, "Identifiant de choix invalide."),
  texte: z.string().trim().min(1, "Chaque choix doit avoir un texte.").max(200, "Choix trop long (200 caractères)."),
  correct: z.boolean(),
});

export const questionBrouillonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("QCM"),
    id: idQuestionSchema,
    enonce: enonceSchema,
    bareme: baremeSchema,
    explication: explicationSchema,
    choix: z
      .array(choixBrouillonSchema)
      .min(2, "Un QCM doit proposer au moins 2 choix.")
      .max(6, "Un QCM propose au plus 6 choix.")
      .refine((choix) => choix.some((c) => c.correct), "Coche au moins une bonne réponse.")
      .refine((choix) => new Set(choix.map((c) => c.id)).size === choix.length, "Deux choix ont le même identifiant."),
  }),
  z.object({
    type: z.literal("VRAI_FAUX"),
    id: idQuestionSchema,
    enonce: enonceSchema,
    bareme: baremeSchema,
    explication: explicationSchema,
    reponse: z.boolean({ required_error: "Indique si l'affirmation est vraie ou fausse." }),
  }),
  z.object({
    type: z.literal("REPONSE_COURTE"),
    id: idQuestionSchema,
    enonce: enonceSchema,
    bareme: baremeSchema,
    explication: explicationSchema,
    reponsesAcceptees: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Une réponse acceptée ne peut pas être vide.")
          .max(100, "Réponse acceptée trop longue (100 caractères)."),
      )
      .min(1, "Indique au moins une réponse acceptée.")
      .max(10, "Au plus 10 réponses acceptées."),
  }),
]);
export type QuestionBrouillon = z.infer<typeof questionBrouillonSchema>;

export const quizBrouillonSchema = z.array(questionBrouillonSchema).max(30, "Un quiz compte au plus 30 questions.");
export type QuizBrouillon = z.infer<typeof quizBrouillonSchema>;

export const creerLeconStudioSchema = z.object({
  chapitreId: z.string().uuid("Choisis un chapitre."),
  titre: z
    .string()
    .trim()
    .min(3, "Le titre doit contenir au moins 3 caractères.")
    .max(150, "Le titre ne doit pas dépasser 150 caractères."),
});
export type CreerLeconStudioDto = z.infer<typeof creerLeconStudioSchema>;

export const modifierLeconStudioSchema = z
  .object({
    titre: creerLeconStudioSchema.shape.titre.optional(),
    contenu: z.string().max(100_000, "Le contenu ne doit pas dépasser 100 000 caractères.").optional(),
    quiz: quizBrouillonSchema.optional(),
  })
  .refine((dto) => Object.values(dto).some((valeur) => valeur !== undefined), { message: "Rien à modifier." });
export type ModifierLeconStudioDto = z.infer<typeof modifierLeconStudioSchema>;

export const apercuSchema = z.object({ contenu: z.string().max(100_000) });

export const refusSchema = z.object({
  commentaire: z
    .string()
    .trim()
    .min(10, "Explique au professeur ce qu'il faut corriger (10 caractères minimum).")
    .max(2000, "Le commentaire ne doit pas dépasser 2 000 caractères."),
});
export type RefusDto = z.infer<typeof refusSchema>;

export type StatutLeconStudio = "BROUILLON" | "EN_REVUE" | "PUBLIE";

export interface CommentaireRevueDto {
  auteur: string;
  contenu: string;
  createdAt: string;
}

export interface LeconStudio {
  id: string;
  slug: string;
  titre: string;
  contenu: string;
  statut: StatutLeconStudio;
  version: number;
  auteur: string | null;
  niveau: Niveau;
  matiere: string;
  chapitre: string;
  quiz: QuizBrouillon;
  modificationsQuizEnCours: boolean;
  commentaires: CommentaireRevueDto[];
  soumisLe: string | null;
  modifiable: boolean;
}

export interface ResumeLeconStudio {
  id: string;
  slug: string;
  titre: string;
  statut: StatutLeconStudio;
  version: number;
  niveau: Niveau;
  matiere: string;
  chapitre: string;
  auteur: string | null;
  soumisLe: string | null;
  majLe: string;
  dernierCommentaire: string | null;
}

export interface ChapitreStudio {
  id: string;
  titre: string;
  niveau: Niveau;
  matiere: string;
}

export interface StatistiquesLecon {
  slug: string;
  titre: string;
  vues: number;
  tentatives: number;
  tauxReussite: number | null;
  scoreMoyen: number | null;
}

export interface StatistiquesProfesseur {
  lecons: StatistiquesLecon[];
  total: { vues: number; tentatives: number; tauxReussite: number | null; scoreMoyen: number | null };
}

export interface TableauStudio {
  lecons: ResumeLeconStudio[];
  statistiques: StatistiquesProfesseur;
  notifications: NotificationEleve[];
  notificationsNonLues: number;
}
