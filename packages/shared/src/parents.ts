import { z } from "zod";
import type { Niveau } from "./niveaux";

export const FREQUENCES_RESUME = ["HEBDOMADAIRE", "MENSUELLE", "AUCUNE"] as const;
export type FrequenceResume = (typeof FREQUENCES_RESUME)[number];

export const codeLiaisonSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Saisis le code donné par ton enfant.")
    .max(20, "Code invalide."),
});

// Numéro international (ex. +221 77 123 45 67) : requis seulement si WhatsApp ou SMS est coché.
const telephoneSchema = z
  .string()
  .trim()
  .transform((valeur) => valeur.replace(/[\s.-]/g, ""))
  .refine((valeur) => /^\+?[0-9]{8,15}$/.test(valeur), "Numéro invalide (ex. +221 77 123 45 67).");

export const preferencesParentSchema = z
  .object({
    frequence: z.enum(FREQUENCES_RESUME, { errorMap: () => ({ message: "Fréquence inconnue." }) }),
    email: z.boolean(),
    whatsapp: z.boolean(),
    sms: z.boolean(),
    telephone: z.preprocess((v) => (v === "" ? undefined : v), telephoneSchema.optional()),
  })
  .refine((dto) => !(dto.whatsapp || dto.sms) || dto.telephone !== undefined, {
    message: "Indique un numéro de téléphone pour recevoir le résumé par WhatsApp ou SMS.",
    path: ["telephone"],
  });
export type PreferencesParentDto = z.infer<typeof preferencesParentSchema>;

export const desinscriptionSchema = z.object({ token: z.string().min(10, "Lien de désinscription invalide.") });

export const declencherResumeSchema = z.object({
  type: z.enum(["HEBDOMADAIRE", "MENSUELLE"], { errorMap: () => ({ message: "Type de résumé inconnu." }) }),
});

export interface CodeLiaisonGenere {
  code: string;
  expireLe: string;
}

export interface EnfantLie {
  id: string;
  nomComplet: string;
  niveau: Niveau | null;
}

export interface ActiviteJourDto {
  jour: string;
  minutes: number;
}

export interface ScoreRecent {
  titre: string;
  score: number;
  le: string;
}

export interface TableauEnfant {
  enfant: EnfantLie;
  // Sept derniers jours (heure de Dakar), du plus ancien au plus récent.
  activite: ActiviteJourDto[];
  minutesSemaine: number;
  leconsTerminees: { total: number; semaine: number; dernieres: { titre: string; le: string }[] };
  scoresRecents: ScoreRecent[];
  serie: { actuelle: number; record: number };
  xpSemaine: number;
  accordParental: { requis: boolean; donne: boolean };
}

export interface PreferencesParent extends Omit<PreferencesParentDto, "telephone"> {
  telephone: string | null;
}
