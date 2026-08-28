import { execSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const apiRoot = join(__dirname, "..");
const prisma = new PrismaClient();

async function publicTableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS "exists"
  `;
  return rows[0]?.exists ?? false;
}

function runCli(command: string): void {
  execSync(command, { cwd: apiRoot, stdio: "pipe" });
}

describe("migration up puis down (e2e)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("la base revient à l'état antérieur sans erreur, puis remonte proprement", async () => {
    await expect(publicTableExists("User")).resolves.toBe(true);

    expect(() => runCli("pnpm db:migrate:down")).not.toThrow();
    await expect(publicTableExists("User")).resolves.toBe(false);
    await expect(publicTableExists("_prisma_migrations")).resolves.toBe(false);

    expect(() => runCli("pnpm db:migrate:deploy")).not.toThrow();
    await expect(publicTableExists("User")).resolves.toBe(true);
    await expect(prisma.user.count()).resolves.toBe(0);
  });
});
