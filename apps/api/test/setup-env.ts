import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

// Les specs e2e créent leurs propres clients (Prisma, Redis) : elles ont besoin du .env racine
// avant tout import, sans écraser les variables déjà fournies (CI).
const fichier = join(__dirname, "..", "..", "..", ".env");
if (existsSync(fichier)) {
  for (const [cle, valeur] of Object.entries(parseEnv(readFileSync(fichier, "utf8")))) {
    process.env[cle] ??= valeur;
  }
}
