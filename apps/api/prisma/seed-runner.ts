import { PrismaClient } from "@prisma/client";
import { seedAll } from "./seed";
import { seedParentDemo, seedProgressionDemo } from "./seed-progression";

const prisma = new PrismaClient();

seedAll(prisma)
  .then(() => seedProgressionDemo(prisma))
  .then(() => seedParentDemo(prisma))
  .then(() => {
    console.log("Seed terminé.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
