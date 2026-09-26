export const XP = {
  LECON_TERMINEE: 10,
  QUIZ_REUSSI: 20,
  QUIZ_PARFAIT: 10,
} as const;

export const SEUIL_QUIZ_REUSSI = 60;

export interface Statistiques {
  leconsTerminees: number;
  quizReussis: number;
  quizParfaits: number;
  chapitresCompletes: number;
  serieRecord: number;
}

export interface DefinitionBadge {
  code: string;
  libelle: string;
  description: string;
  merite: (stats: Statistiques) => boolean;
}

export const BADGES: DefinitionBadge[] = [
  {
    code: "premiere-lecon",
    libelle: "Première leçon",
    description: "Terminer une première leçon.",
    merite: (s) => s.leconsTerminees >= 1,
  },
  {
    code: "premier-quiz-reussi",
    libelle: "Premier quiz réussi",
    description: "Réussir un quiz (60 % ou plus).",
    merite: (s) => s.quizReussis >= 1,
  },
  {
    code: "sans-faute",
    libelle: "Sans faute",
    description: "Obtenir 100 % à un quiz.",
    merite: (s) => s.quizParfaits >= 1,
  },
  {
    code: "chapitre-complete",
    libelle: "Chapitre bouclé",
    description: "Terminer toutes les leçons d'un chapitre et réussir leurs quiz.",
    merite: (s) => s.chapitresCompletes >= 1,
  },
  {
    code: "serie-7-jours",
    libelle: "Sept jours de suite",
    description: "Apprendre sept jours d'affilée.",
    merite: (s) => s.serieRecord >= 7,
  },
  {
    code: "dix-lecons",
    libelle: "Lecteur assidu",
    description: "Terminer dix leçons.",
    merite: (s) => s.leconsTerminees >= 10,
  },
];

export function badgesMerites(stats: Statistiques): string[] {
  return BADGES.filter((badge) => badge.merite(stats)).map((badge) => badge.code);
}

export interface EtatLecon {
  terminee: boolean;
  aUnQuiz: boolean;
  quizReussi: boolean;
}

export interface Avancement {
  pourcentage: number;
  complet: boolean;
  leconsTerminees: number;
  leconsTotal: number;
}

// Chaque leçon compte pour une étape (la terminer), plus une si elle a un quiz (le réussir).
export function avancement(lecons: EtatLecon[]): Avancement {
  const total = lecons.reduce((somme, l) => somme + 1 + (l.aUnQuiz ? 1 : 0), 0);
  const faites = lecons.reduce(
    (somme, l) => somme + (l.terminee ? 1 : 0) + (l.aUnQuiz && l.quizReussi ? 1 : 0),
    0,
  );
  return {
    pourcentage: total === 0 ? 0 : Math.round((faites / total) * 100),
    complet: total > 0 && faites === total,
    leconsTerminees: lecons.filter((l) => l.terminee).length,
    leconsTotal: lecons.length,
  };
}

export interface EntreeClassement {
  utilisateurId: string;
  pseudonyme: string;
  xp: number;
}

// Classement « sportif » : deux ex æquo partagent le même rang, le suivant saute (1, 2, 2, 4).
export function classer(entrees: EntreeClassement[]): (EntreeClassement & { rang: number })[] {
  const triees = [...entrees].sort((a, b) => b.xp - a.xp || a.pseudonyme.localeCompare(b.pseudonyme));
  return triees.map((entree) => {
    const premierEgal = triees.findIndex((autre) => autre.xp === entree.xp);
    return { ...entree, rang: premierEgal + 1 };
  });
}
