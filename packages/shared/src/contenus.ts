import { z } from "zod";
import type { Matiere } from "./matieres";
import { MATIERES } from "./matieres";
import { NIVEAUX, type Niveau } from "./niveaux";

const titreSchema = z
  .string()
  .trim()
  .min(3, "Le titre doit contenir au moins 3 caractères.")
  .max(150, "Le titre ne doit pas dépasser 150 caractères.");

const ordreSchema = z.coerce.number().int().min(1, "L'ordre doit être un entier positif.");

export const creerChapitreSchema = z.object({
  niveau: z.enum(NIVEAUX, { errorMap: () => ({ message: "Niveau inconnu." }) }),
  matiere: z.enum(MATIERES, { errorMap: () => ({ message: "Matière inconnue." }) }),
  titre: titreSchema,
  ordre: ordreSchema.optional(),
});
export type CreerChapitreDto = z.infer<typeof creerChapitreSchema>;

export const modifierChapitreSchema = z
  .object({ titre: titreSchema.optional(), ordre: ordreSchema.optional() })
  .refine((dto) => Object.values(dto).some((valeur) => valeur !== undefined), {
    message: "Rien à modifier.",
  });
export type ModifierChapitreDto = z.infer<typeof modifierChapitreSchema>;

const contenuSchema = z.string().max(100_000, "Le contenu ne doit pas dépasser 100 000 caractères.");

export const creerLeconSchema = z.object({
  chapitreId: z.string().uuid("Chapitre invalide."),
  titre: titreSchema,
  contenu: contenuSchema.optional(),
  ordre: ordreSchema.optional(),
});
export type CreerLeconDto = z.infer<typeof creerLeconSchema>;

export const modifierLeconSchema = z
  .object({ titre: titreSchema.optional(), contenu: contenuSchema.optional(), ordre: ordreSchema.optional() })
  .refine((dto) => Object.values(dto).some((valeur) => valeur !== undefined), {
    message: "Rien à modifier.",
  });
export type ModifierLeconDto = z.infer<typeof modifierLeconSchema>;

export interface SectionLecon {
  titre: string | null;
  html: string;
}

export interface MatiereCatalogue {
  libelle: Matiere;
  slug: string;
  nom: string;
  nombreLecons: number;
}

export interface NiveauCatalogue {
  niveau: Niveau;
  matieres: MatiereCatalogue[];
}

export interface LeconResumee {
  slug: string;
  titre: string;
}

export interface ChapitreCatalogue {
  titre: string;
  lecons: LeconResumee[];
}

export interface PageMatiere {
  niveau: Niveau;
  matiere: MatiereCatalogue;
  chapitres: ChapitreCatalogue[];
}

export interface LeconPubliee {
  slug: string;
  titre: string;
  resume: string;
  version: number;
  publieLe: string;
  niveau: Niveau;
  matiere: Omit<MatiereCatalogue, "nombreLecons">;
  chapitre: string;
  sections: SectionLecon[];
  precedente: LeconResumee | null;
  suivante: LeconResumee | null;
}

export interface EntreePlanDuSite {
  niveau: Niveau;
  matiere: string;
  slug: string;
  publieLe: string;
}
