import type { StatistiquesLecon, StatistiquesProfesseur } from "@xel-e/shared";

export interface DonneesLecon {
  slug: string;
  titre: string;
  vues: number;
  // Tentatives terminées d'élèves, dont celles au-dessus du seuil de réussite, et somme des scores (sur 100).
  tentatives: number;
  reussies: number;
  sommeScores: number;
}

const arrondi = (valeur: number) => Math.round(valeur * 10) / 10;

function ratios(tentatives: number, reussies: number, sommeScores: number) {
  if (tentatives === 0) return { tauxReussite: null, scoreMoyen: null };
  return { tauxReussite: arrondi((reussies / tentatives) * 100), scoreMoyen: arrondi(sommeScores / tentatives) };
}

// Totaux pondérés par le nombre de tentatives (et non moyenne des moyennes par leçon).
export function agregerStatistiques(lecons: DonneesLecon[]): StatistiquesProfesseur {
  const lignes: StatistiquesLecon[] = lecons
    .map((l) => ({ slug: l.slug, titre: l.titre, vues: l.vues, tentatives: l.tentatives, ...ratios(l.tentatives, l.reussies, l.sommeScores) }))
    .sort((a, b) => b.vues - a.vues || a.titre.localeCompare(b.titre, "fr"));
  const somme = (cle: "vues" | "tentatives" | "reussies" | "sommeScores") => lecons.reduce((total, l) => total + l[cle], 0);
  const tentatives = somme("tentatives");
  return {
    lecons: lignes,
    total: { vues: somme("vues"), tentatives, ...ratios(tentatives, somme("reussies"), somme("sommeScores")) },
  };
}
