import { execSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const apiRoot = join(__dirname, "..");
const prisma = new PrismaClient();

async function instantaneSchema(): Promise<string> {
  const colonnes = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, column_name
  `;
  const enums = await prisma.$queryRaw`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `;
  const index = await prisma.$queryRaw`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY indexname
  `;
  const contraintes = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY conname
  `;
  return JSON.stringify({ colonnes, enums, index, contraintes });
}

function executer(commande: string): void {
  execSync(commande, { cwd: apiRoot, stdio: "pipe", env: process.env });
}

describe("migration la plus récente : up puis down (e2e)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("le down ramène exactement au schéma antérieur, et le up le reconstruit à l'identique", async () => {
    const migre = await instantaneSchema();

    executer("pnpm db:migrate:down");
    const avantDerniere = await instantaneSchema();
    expect(avantDerniere).not.toBe(migre);

    executer("pnpm db:migrate:deploy");
    expect(await instantaneSchema()).toBe(migre);

    executer("pnpm db:migrate:down");
    expect(await instantaneSchema()).toBe(avantDerniere);

    executer("pnpm db:migrate:deploy");
    expect(await instantaneSchema()).toBe(migre);
  });
});
