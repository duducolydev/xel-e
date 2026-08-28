import { z } from "zod";

export const ROLES = ["ELEVE", "PROFESSEUR", "PARENT", "ADMIN"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const STATUTS_LECON = ["BROUILLON", "EN_REVUE", "PUBLIE"] as const;
export const statutLeconSchema = z.enum(STATUTS_LECON);
export type StatutLecon = z.infer<typeof statutLeconSchema>;

export const TYPES_QUESTION = ["QCM", "VRAI_FAUX", "REPONSE_COURTE"] as const;
export const typeQuestionSchema = z.enum(TYPES_QUESTION);
export type TypeQuestion = z.infer<typeof typeQuestionSchema>;
