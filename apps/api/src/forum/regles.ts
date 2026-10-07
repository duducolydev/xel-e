import { SEUIL_MASQUAGE, type EtatMessage } from "@xel-e/shared";

export interface EtatModeration {
  masque: boolean;
  verifieLe: Date | null;
  deletedAt: Date | null;
}

// Masquage automatique au 3e signalement (de comptes distincts), en attendant la modération.
// Un message déjà innocenté par la modération n'est plus masqué automatiquement : les nouveaux
// signalements remontent dans la file, sans effet immédiat.
export function doitMasquer(message: EtatModeration, signalementsActifs: number): boolean {
  return !message.masque && message.deletedAt === null && message.verifieLe === null && signalementsActifs >= SEUIL_MASQUAGE;
}

export function etatMessage(message: EtatModeration): EtatMessage {
  if (message.deletedAt) return "supprime";
  return message.masque ? "masque" : "visible";
}
