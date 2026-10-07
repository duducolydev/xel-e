import type { TypeResume } from "./periodes";

export interface ActiviteEnfant {
  nomComplet: string;
  minutes: number;
  joursActifs: number;
  leconsTerminees: string[];
  quiz: { titre: string; score: number }[];
  serie: number;
}

export interface EntreeResume {
  parent: string;
  periode: { type: TypeResume; libelle: string };
  enfants: ActiviteEnfant[];
  liens: { tableauDeBord: string; desinscription: string };
}

export interface ResumeCompose {
  sujet: string;
  // Email (texte complet, avec liens).
  texte: string;
  // In-app, WhatsApp et SMS : une phrase par enfant, sans lien de désinscription.
  texteCourt: string;
}

const SIGNATURE = "\n\n— L'équipe Xel-E\nXeeli ci xel";
const MAX_LISTE = 5;

export function prenom(nomComplet: string): string {
  return nomComplet.trim().split(/\s+/)[0] ?? nomComplet;
}

export function duree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

// « quiz » est invariable.
const pluriel = (nombre: number, mot: string) => `${nombre} ${mot}${nombre > 1 && !mot.endsWith("z") ? "s" : ""}`;

function liste(elements: string[]): string {
  const visibles = elements.slice(0, MAX_LISTE);
  const reste = elements.length - visibles.length;
  return visibles.join(", ") + (reste > 0 ? ` et ${pluriel(reste, "autre")}` : "");
}

function moyenne(quiz: ActiviteEnfant["quiz"]): number {
  return Math.round(quiz.reduce((total, q) => total + q.score, 0) / quiz.length);
}

export function estInactif(enfant: ActiviteEnfant): boolean {
  return enfant.minutes === 0 && enfant.leconsTerminees.length === 0 && enfant.quiz.length === 0;
}

function paragrapheEnfant(enfant: ActiviteEnfant, periode: string): string {
  const nom = prenom(enfant.nomComplet);
  if (estInactif(enfant)) {
    return (
      `${nom} n'a pas travaillé sur Xel-E ${periode === "semaine" ? "cette semaine" : "ce mois-ci"}. Un petit encouragement peut l'aider à ` +
      `reprendre : un quart d'heure par jour suffit pour progresser.`
    );
  }
  const lignes = [`${nom} a travaillé ${duree(enfant.minutes)}, sur ${pluriel(enfant.joursActifs, "jour")}.`];
  lignes.push(
    enfant.leconsTerminees.length > 0
      ? `Leçons terminées (${enfant.leconsTerminees.length}) : ${liste(enfant.leconsTerminees)}.`
      : "Aucune leçon terminée.",
  );
  if (enfant.quiz.length > 0) {
    const details = liste(enfant.quiz.map((q) => `${q.titre} (${Math.round(q.score)} %)`));
    lignes.push(`Quiz (${enfant.quiz.length}, moyenne ${moyenne(enfant.quiz)} %) : ${details}.`);
  } else {
    lignes.push("Aucun quiz passé.");
  }
  if (enfant.serie >= 2) lignes.push(`Série en cours : ${enfant.serie} jours d'affilée, bravo !`);
  return lignes.join("\n");
}

function phraseCourte(enfant: ActiviteEnfant): string {
  const nom = prenom(enfant.nomComplet);
  if (estInactif(enfant)) return `${nom} : pas d'activité`;
  const morceaux = [duree(enfant.minutes), pluriel(enfant.leconsTerminees.length, "leçon")];
  if (enfant.quiz.length > 0) morceaux.push(`${pluriel(enfant.quiz.length, "quiz")} (moy. ${moyenne(enfant.quiz)} %)`);
  return `${nom} : ${morceaux.join(", ")}`;
}

export function composerResume(entree: EntreeResume): ResumeCompose {
  const { periode, enfants } = entree;
  const nomPeriode = periode.type === "HEBDOMADAIRE" ? "semaine" : "mois";
  const titre = periode.libelle.charAt(0).toUpperCase() + periode.libelle.slice(1);
  const tousInactifs = enfants.every(estInactif);

  const corps = enfants.map((enfant) => paragrapheEnfant(enfant, nomPeriode)).join("\n\n");
  const texte =
    `Bonjour ${entree.parent},\n\n` +
    `Voici le résumé de la ${periode.libelle} sur Xel-E.\n\n` +
    `${corps}\n\n` +
    (tousInactifs
      ? "Vous pourrez suivre sa reprise, jour par jour, depuis votre espace parent :\n"
      : "Le détail (scores, leçons, temps par jour) est dans votre espace parent :\n") +
    `${entree.liens.tableauDeBord}\n\n` +
    `Ne plus recevoir ce résumé : ${entree.liens.desinscription}` +
    SIGNATURE;

  return {
    sujet: `${titre} : le résumé Xel-E`,
    texte,
    texteCourt: `Xel-E, ${periode.libelle} — ${enfants.map(phraseCourte).join(" ; ")}.`,
  };
}
