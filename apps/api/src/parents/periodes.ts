import { debutSemaine, decalerJour, FUSEAU_PLATEFORME, jourLocal } from "../progression/temps";

export type TypeResume = "HEBDOMADAIRE" | "MENSUELLE";

export interface Periode {
  type: TypeResume;
  // Identifiant stable de la période (« 2026-S41 », « 2026-09 ») : un seul envoi par parent et canal.
  cle: string;
  debut: Date;
  fin: Date;
  // Jours calendaires couverts (AAAA-MM-JJ, heure de Dakar), bornes incluses.
  premierJour: string;
  dernierJour: string;
  libelle: string;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dateLongue(jour: string): string {
  const [, mois, quantieme] = jour.split("-").map(Number);
  return `${quantieme === 1 ? "1er" : quantieme} ${MOIS[mois! - 1]}`;
}

// « 5 au 11 octobre », ou « 28 septembre au 4 octobre » quand la semaine change de mois.
function intervalle(premierJour: string, dernierJour: string): string {
  const memeMois = premierJour.slice(0, 7) === dernierJour.slice(0, 7);
  const debut = memeMois ? dateLongue(premierJour).split(" ")[0]! : dateLongue(premierJour);
  return `${debut} au ${dateLongue(dernierJour)}`;
}

// Numéro de semaine ISO 8601 du lundi donné.
function semaineIso(lundi: string): { annee: number; numero: number } {
  const date = new Date(`${lundi}T00:00:00Z`);
  const jeudi = new Date(date.getTime() + 3 * 86_400_000);
  // La semaine appartient à l'année de son jeudi ; son rang est celui de ce jeudi dans l'année.
  const annee = jeudi.getUTCFullYear();
  const numero = Math.floor((jeudi.getTime() - Date.UTC(annee, 0, 1)) / 86_400_000 / 7) + 1;
  return { annee, numero };
}

function minuitDakar(jour: string): Date {
  // Dakar vit à UTC+0 toute l'année (pas d'heure d'été) : minuit local = minuit UTC.
  return new Date(`${jour}T00:00:00Z`);
}

// Résumé hebdomadaire (dimanche 18 h) : la semaine en cours, du lundi 00:00 à l'instant de l'envoi.
// Résumé mensuel (le 1er à 18 h) : le mois calendaire précédent.
export function periodeDuResume(type: TypeResume, maintenant: Date): Periode {
  if (type === "HEBDOMADAIRE") {
    const debut = debutSemaine(maintenant);
    const premierJour = jourLocal(debut);
    const dernierJour = decalerJour(premierJour, 6);
    const { annee, numero } = semaineIso(premierJour);
    return {
      type,
      cle: `${annee}-S${String(numero).padStart(2, "0")}`,
      debut,
      fin: maintenant,
      premierJour,
      dernierJour,
      libelle: `semaine du ${intervalle(premierJour, dernierJour)}`,
    };
  }
  const aujourdhui = jourLocal(maintenant, FUSEAU_PLATEFORME);
  const [annee, mois] = aujourdhui.split("-").map(Number) as [number, number];
  const anneePrec = mois === 1 ? annee - 1 : annee;
  const moisPrec = mois === 1 ? 12 : mois - 1;
  const premierJour = `${anneePrec}-${String(moisPrec).padStart(2, "0")}-01`;
  const debutMoisCourant = `${annee}-${String(mois).padStart(2, "0")}-01`;
  return {
    type,
    cle: `${anneePrec}-${String(moisPrec).padStart(2, "0")}`,
    debut: minuitDakar(premierJour),
    fin: minuitDakar(debutMoisCourant),
    premierJour,
    dernierJour: decalerJour(debutMoisCourant, -1),
    libelle: `mois de ${MOIS[moisPrec - 1]} ${anneePrec}`,
  };
}
