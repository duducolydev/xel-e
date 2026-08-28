import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide.");

export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .regex(/[a-zA-Z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.");
