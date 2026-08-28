import { PrismaClient } from "@prisma/client";
import { seedAll } from "./seed";

const prisma = new PrismaClient();

seedAll(prisma)
  .then(() => {
    console.log("Seed terminé.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
