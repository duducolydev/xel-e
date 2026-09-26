import { z } from "zod";

export const pseudonymeSchema = z
  .string()
  .trim()
  .min(3, "Le pseudonyme doit contenir au moins 3 caractères.")
  .max(20, "Le pseudonyme ne doit pas dépasser 20 caractères.")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Le pseudonyme ne peut contenir que des lettres sans accent, des chiffres, « _ » et « - ».",
  );

export const reglageClassementSchema = z.discriminatedUnion("actif", [
  z.object({ actif: z.literal(true), pseudonyme: pseudonymeSchema }),
  z.object({ actif: z.literal(false) }),
]);
export type ReglageClassementDto = z.infer<typeof reglageClassementSchema>;

export interface BadgeObtenu {
  code: string;
  libelle: string;
  description: string;
}

export interface Gains {
  xp: number;
  badges: BadgeObtenu[];
}

export interface ResultatLeconTerminee extends Gains {
  dejaTerminee: boolean;
}

export interface EtatLeconEleve {
  terminee: boolean;
  quizReussi: boolean;
  meilleurScore: number | null;
}

export interface AvancementChapitre {
  titre: string;
  pourcentage: number;
  complet: boolean;
  leconsTerminees: number;
  leconsTotal: number;
}

export interface AvancementMatiere {
  slug: string;
  nom: string;
  pourcentage: number;
  chapitres: AvancementChapitre[];
}

export interface BadgeTableau extends BadgeObtenu {
  obtenuLe: string | null;
}

export interface Activite {
  type: "lecon" | "quiz";
  titre: string;
  slug: string;
  score: number | null;
  le: string;
}

export interface NotificationEleve {
  id: string;
  contenu: string;
  lu: boolean;
  createdAt: string;
}

export interface TableauDeBordProgression {
  niveau: string | null;
  xpTotal: number;
  xpSemaine: number;
  serie: { actuelle: number; record: number };
  matieres: AvancementMatiere[];
  badges: BadgeTableau[];
  activites: Activite[];
  notifications: NotificationEleve[];
  notificationsNonLues: number;
}

export interface LigneClassement {
  rang: number;
  pseudonyme: string;
  xp: number;
  estMoi: boolean;
}

export interface Classement {
  niveau: string | null;
  debutSemaine: string;
  participe: boolean;
  pseudonyme: string | null;
  lignes: LigneClassement[];
  monRang: LigneClassement | null;
}
