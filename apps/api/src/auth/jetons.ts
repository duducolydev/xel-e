import { createHmac, randomBytes } from "node:crypto";

export function genererJeton(): string {
  return randomBytes(32).toString("base64url");
}

// HMAC plutôt qu'un simple SHA-256 : une fuite de la base seule ne permet pas de vérifier un jeton.
export function hasherJeton(secret: string, jeton: string): string {
  return createHmac("sha256", secret).update(jeton).digest("hex");
}
