import "./setup-env";
import { PrismaClient } from "@prisma/client";
import { seedAll } from "../prisma/seed";
import { viderBase, viderLimiteurs, viderMailhog } from "./infra";

// Remet la pile dans un état connu avant la suite Playwright (appelé par son globalSetup).
async function preparer(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await viderBase(prisma);
    await seedAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
  await viderLimiteurs();
  await viderMailhog();
}

preparer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
