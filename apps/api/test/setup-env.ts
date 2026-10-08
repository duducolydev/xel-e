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

// Pas de résumé planifié pendant les tests (ils sont déclenchés à la main) ; nouvelles tentatives rapides.
process.env.RESUMES_PLANIFIES ??= "false";
process.env.RESUME_BACKOFF_MS ??= "50";
process.env.ABONNEMENTS_PLANIFIES ??= "false";
