import { z } from "zod";
import { NIVEAUX } from "./niveaux";

export const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide.");

export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(128, "Le mot de passe ne doit pas dépasser 128 caractères.")
  .regex(/[a-zA-Z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.");

export const identifiantSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "L'identifiant doit contenir au moins 3 caractères.")
  .max(30, "L'identifiant ne doit pas dépasser 30 caractères.")
  .regex(
    /^[a-z0-9._-]+$/,
    "L'identifiant ne peut contenir que des lettres sans accent, des chiffres, « . », « _ » et « - ».",
  );

export const nomCompletSchema = z
  .string()
  .trim()
  .min(2, "Le nom doit contenir au moins 2 caractères.")
  .max(100, "Le nom ne doit pas dépasser 100 caractères.");

const ANNEE_MIN = 1990;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const inscriptionEleveSchema = z
  .object({
    nomComplet: nomCompletSchema,
    email: z.preprocess(emptyToUndefined, emailSchema.optional()),
    identifiant: z.preprocess(emptyToUndefined, identifiantSchema.optional()),
    niveau: z.enum(NIVEAUX, { errorMap: () => ({ message: "Choisis ta classe." }) }),
    naissanceMois: z.coerce
      .number({ invalid_type_error: "Mois de naissance invalide." })
      .int()
      .min(1, "Mois de naissance invalide.")
      .max(12, "Mois de naissance invalide."),
    naissanceAnnee: z.coerce
      .number({ invalid_type_error: "Année de naissance invalide." })
      .int()
      .min(ANNEE_MIN, "Année de naissance invalide."),
    motDePasse: passwordSchema,
    contactParentEmail: z.preprocess(emptyToUndefined, emailSchema.optional()),
  })
  .refine((data) => data.email !== undefined || data.identifiant !== undefined, {
    message: "Renseigne une adresse email ou un identifiant.",
    path: ["email"],
  });

export type InscriptionEleveDto = z.infer<typeof inscriptionEleveSchema>;

export const inscriptionProfesseurSchema = z.object({
  nomComplet: nomCompletSchema,
  email: emailSchema,
  motDePasse: passwordSchema,
});

export type InscriptionProfesseurDto = z.infer<typeof inscriptionProfesseurSchema>;

export const inscriptionParentSchema = inscriptionProfesseurSchema;

export type InscriptionParentDto = z.infer<typeof inscriptionParentSchema>;

export const connexionSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Renseigne ton email ou ton identifiant."),
  motDePasse: z.string().min(1, "Renseigne ton mot de passe."),
});

export type ConnexionDto = z.infer<typeof connexionSchema>;

export const motDePasseOublieSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Renseigne ton email ou ton identifiant."),
});

export type MotDePasseOublieDto = z.infer<typeof motDePasseOublieSchema>;

export const jetonSchema = z.object({
  token: z.string().min(1, "Lien invalide ou incomplet."),
});

export type JetonDto = z.infer<typeof jetonSchema>;

export const reinitialisationMotDePasseSchema = jetonSchema.extend({
  motDePasse: passwordSchema,
});

export type ReinitialisationMotDePasseDto = z.infer<typeof reinitialisationMotDePasseSchema>;

export interface UtilisateurCourant {
  id: string;
  nomComplet: string;
  role: "ELEVE" | "PROFESSEUR" | "PARENT" | "ADMIN";
  email: string | null;
  identifiant: string | null;
  emailConfirme: boolean;
  consentementParentalRequis: boolean;
  consentementParentalDonne: boolean;
  accesForum: boolean;
}
