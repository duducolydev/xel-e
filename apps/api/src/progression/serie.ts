import { decalerJour } from "./temps";

export interface EtatSerie {
  serieJours: number;
  serieRecord: number;
  dernierJourActif: string | null;
}

// Même jour : rien ne change ; lendemain du dernier jour actif : +1 ; au-delà : la série repart à 1.
export function enregistrerJourActif(etat: EtatSerie, jour: string): EtatSerie {
  if (etat.dernierJourActif === jour) return etat;
  const serieJours = etat.dernierJourActif === decalerJour(jour, -1) ? etat.serieJours + 1 : 1;
  return { serieJours, serieRecord: Math.max(etat.serieRecord, serieJours), dernierJourActif: jour };
}

// Série à afficher : elle tient tant que le dernier jour actif est aujourd'hui ou hier.
export function serieCourante(etat: EtatSerie, aujourdhui: string): number {
  if (!etat.dernierJourActif) return 0;
  const encoreValable =
    etat.dernierJourActif === aujourdhui || etat.dernierJourActif === decalerJour(aujourdhui, -1);
  return encoreValable ? etat.serieJours : 0;
}
