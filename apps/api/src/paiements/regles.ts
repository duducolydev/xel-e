import { createHmac, timingSafeEqual } from "node:crypto";

// --- Périodes d'abonnement ---

export interface Periode {
  statut: "ACTIF" | "EXPIRE" | "ANNULE";
  debutLe: Date;
  expireLe: Date | null;
}

const JOUR_MS = 86_400_000;
export const DELAI_RELANCE_JOURS = 3;

// Ajoute des mois calendaires ; le jour est ramené au dernier jour du mois si besoin
// (31 janvier + 1 mois = 28 ou 29 février).
export function ajouterMois(date: Date, mois: number): Date {
  const annee = date.getUTCFullYear();
  const moisCible = date.getUTCMonth() + mois;
  const dernierJour = new Date(Date.UTC(annee, moisCible + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(annee, moisCible, Math.min(date.getUTCDate(), dernierJour), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  );
}

// Les périodes encore valables (actives, non terminées), triées par début.
function periodesValables(periodes: Periode[], maintenant: Date): Periode[] {
  return periodes
    .filter((p) => p.statut === "ACTIF" && (p.expireLe === null || p.expireLe.getTime() > maintenant.getTime()))
    .sort((a, b) => a.debutLe.getTime() - b.debutLe.getTime());
}

// Nouvelle période achetée : elle commence maintenant, ou à la fin de la dernière période valable
// (renouvellement anticipé) — jamais de chevauchement, jamais de jour perdu.
export function prochainePeriode(periodes: Periode[], maintenant: Date, dureeMois: number): { debutLe: Date; expireLe: Date } {
  const finDernier = periodesValables(periodes, maintenant).reduce<Date | null>(
    (fin, p) => (p.expireLe && (!fin || p.expireLe.getTime() > fin.getTime()) ? p.expireLe : fin),
    null,
  );
  const debutLe = finDernier ?? maintenant;
  return { debutLe, expireLe: ajouterMois(debutLe, dureeMois) };
}

export function seChevauchent(a: { debutLe: Date; expireLe: Date | null }, b: { debutLe: Date; expireLe: Date | null }): boolean {
  const finA = a.expireLe?.getTime() ?? Number.POSITIVE_INFINITY;
  const finB = b.expireLe?.getTime() ?? Number.POSITIVE_INFINITY;
  return a.debutLe.getTime() < finB && b.debutLe.getTime() < finA;
}

export interface EtatPremium {
  actif: boolean;
  // Fin de l'accès continu (périodes enchaînées comprises), ou dernière fin connue si expiré.
  jusquau: Date | null;
  aRenouveler: boolean;
}

export function etatPremium(periodes: Periode[], maintenant: Date): EtatPremium {
  const valables = periodesValables(periodes, maintenant);
  const courante = valables.find((p) => p.debutLe.getTime() <= maintenant.getTime());
  if (!courante) {
    const derniereFin = periodes
      .map((p) => p.expireLe)
      .filter((d): d is Date => d !== null && d.getTime() <= maintenant.getTime())
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return { actif: false, jusquau: derniereFin ?? null, aRenouveler: false };
  }
  // Fin de la chaîne : on suit les périodes qui démarrent exactement à la fin de la précédente.
  let fin = courante.expireLe;
  for (const suivante of valables) {
    if (fin && suivante.debutLe.getTime() === fin.getTime()) fin = suivante.expireLe;
  }
  const aRenouveler = fin !== null && fin.getTime() - maintenant.getTime() <= DELAI_RELANCE_JOURS * JOUR_MS;
  return { actif: true, jusquau: fin, aRenouveler };
}

// Relance J-3 : la période se termine dans les 3 jours, rien ne lui succède, pas encore relancée.
export function doitRelancer(
  periode: Periode & { relanceLe: Date | null },
  toutes: Periode[],
  maintenant: Date,
): boolean {
  if (periode.statut !== "ACTIF" || periode.relanceLe !== null || periode.expireLe === null) return false;
  const restant = periode.expireLe.getTime() - maintenant.getTime();
  if (restant <= 0 || restant > DELAI_RELANCE_JOURS * JOUR_MS) return false;
  const finPeriode = periode.expireLe.getTime();
  return !toutes.some((p) => p !== periode && p.statut === "ACTIF" && p.debutLe.getTime() >= finPeriode);
}

// Rétrogradation douce : la période passe à EXPIRE, les données de l'élève restent.
export function doitExpirer(periode: Periode, maintenant: Date): boolean {
  return periode.statut === "ACTIF" && periode.expireLe !== null && periode.expireLe.getTime() <= maintenant.getTime();
}

// --- Reçus ---

export function numeroRecu(annee: number, valeur: number): string {
  return `XE-${annee}-${String(valeur).padStart(6, "0")}`;
}

// --- Signatures de webhooks (schéma Wave : « t=<horodatage>,v1=<hmac hex> » sur `${t}${corps}`) ---

export const TOLERANCE_SIGNATURE_S = 300;

export function signerWebhook(secret: string, horodatage: number, corps: string): string {
  const empreinte = createHmac("sha256", secret).update(`${horodatage}${corps}`).digest("hex");
  return `t=${horodatage},v1=${empreinte}`;
}

export function egalConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Vérifie l'en-tête de signature : HMAC correct (comparaison en temps constant) et horodatage récent
// (au plus 5 minutes d'écart, contre le rejeu d'une requête interceptée).
export function verifierSignature(entete: string | undefined, corps: string, secret: string, maintenant: Date): boolean {
  if (!entete || !secret) return false;
  const champs = Object.fromEntries(
    entete.split(",").map((morceau) => {
      const [cle, ...valeur] = morceau.trim().split("=");
      return [cle, valeur.join("=")];
    }),
  );
  const horodatage = Number(champs.t);
  const signatures = entete
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.startsWith("v1="))
    .map((m) => m.slice(3));
  if (!Number.isFinite(horodatage) || signatures.length === 0) return false;
  if (Math.abs(maintenant.getTime() / 1000 - horodatage) > TOLERANCE_SIGNATURE_S) return false;
  const attendue = createHmac("sha256", secret).update(`${horodatage}${corps}`).digest("hex");
  return signatures.some((signature) => egalConstant(signature, attendue));
}

