import { createHmac, randomInt } from "node:crypto";

// Sans caractères ambigus à la lecture ou à la dictée (0/O, 1/I/L).
export const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LONGUEUR_CODE = 8;
export const DUREE_CODE_MS = 48 * 60 * 60 * 1000;

// Code affiché en deux blocs (« K7PM-3XQ9 ») : 31⁸ ≈ 850 milliards de possibilités.
export function genererCode(tirage: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i += 1) code += ALPHABET_CODE[tirage(ALPHABET_CODE.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Tolère minuscules, espaces et tirets à la saisie ; null si le code ne peut pas être valide.
export function normaliserCode(saisie: string): string | null {
  const code = saisie.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== LONGUEUR_CODE) return null;
  return [...code].every((c) => ALPHABET_CODE.includes(c)) ? code : null;
}

// Seule l'empreinte est stockée : une fuite de la base ne donne pas de code utilisable.
export function hacherCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export interface EtatCode {
  expireLe: Date;
  utiliseLe: Date | null;
}

export function estUtilisable(code: EtatCode, maintenant: Date): boolean {
  return code.utiliseLe === null && code.expireLe.getTime() > maintenant.getTime();
}
