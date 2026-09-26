import { hash, verify } from "@node-rs/argon2";

export function hasherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse);
}

export async function verifierMotDePasse(motDePasseHash: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(motDePasseHash, motDePasse);
  } catch {
    return false;
  }
}

let hashLeurre: Promise<string> | undefined;

// Vérifie contre un hash factice quand le compte n'existe pas : même durée de réponse, pas d'énumération.
export async function verifierLeurre(motDePasse: string): Promise<false> {
  hashLeurre ??= hasherMotDePasse("leurre-sans-compte-0");
  await verifierMotDePasse(await hashLeurre, motDePasse);
  return false;
}
