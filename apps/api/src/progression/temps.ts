export const FUSEAU_PLATEFORME = "Africa/Dakar";

const JOUR_MS = 24 * 60 * 60 * 1000;

function partiesLocales(instant: Date, fuseau: string): { annee: number; mois: number; jour: number; heure: number; minute: number } {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value);
  return { annee: valeur("year"), mois: valeur("month"), jour: valeur("day"), heure: valeur("hour"), minute: valeur("minute") };
}

// Jour calendaire (AAAA-MM-JJ) d'un instant dans le fuseau donné.
export function jourLocal(instant: Date, fuseau = FUSEAU_PLATEFORME): string {
  const { annee, mois, jour } = partiesLocales(instant, fuseau);
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

export function decalerJour(jour: string, decalage: number): string {
  const date = new Date(`${jour}T00:00:00Z`);
  return new Date(date.getTime() + decalage * JOUR_MS).toISOString().slice(0, 10);
}

// Instant correspondant à minuit (heure locale) du jour donné.
function minuitLocal(jour: string, fuseau: string): Date {
  const approximation = new Date(`${jour}T00:00:00Z`);
  const local = partiesLocales(approximation, fuseau);
  const ecart = Date.UTC(local.annee, local.mois - 1, local.jour, local.heure, local.minute) - approximation.getTime();
  return new Date(approximation.getTime() - ecart);
}

// Début de la semaine (lundi 00:00, heure locale) contenant l'instant donné.
export function debutSemaine(instant: Date, fuseau = FUSEAU_PLATEFORME): Date {
  const jour = jourLocal(instant, fuseau);
  const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay();
  const depuisLundi = (jourSemaine + 6) % 7;
  return minuitLocal(decalerJour(jour, -depuisLundi), fuseau);
}
