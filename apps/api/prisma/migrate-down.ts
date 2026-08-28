import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const apiRoot = join(__dirname, "..");
const migrationsDir = join(apiRoot, "prisma", "migrations");

const latestMigration = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .at(-1);

if (!latestMigration) {
  throw new Error("Aucune migration trouvée dans prisma/migrations.");
}

const downFile = join(migrationsDir, latestMigration, "down.sql");

execSync(`prisma db execute --file "${downFile}" --schema prisma/schema.prisma`, {
  stdio: "inherit",
  cwd: apiRoot,
});
