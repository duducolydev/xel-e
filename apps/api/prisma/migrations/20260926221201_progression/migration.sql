-- CreateEnum
CREATE TYPE "SourceXp" AS ENUM ('LECON_TERMINEE', 'QUIZ_REUSSI', 'QUIZ_PARFAIT');

-- DropIndex
DROP INDEX "Notification_utilisateurId_idx";

-- AlterTable
ALTER TABLE "Progression" DROP COLUMN "pourcentage",
DROP COLUMN "xp",
ADD COLUMN     "meilleurScore" DOUBLE PRECISION,
ADD COLUMN     "quizReussiLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tentative" ADD COLUMN     "xpGagne" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "classementActif" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dernierJourActif" TEXT,
ADD COLUMN     "serieJours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serieRecord" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GainXp" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "source" "SourceXp" NOT NULL,
    "cle" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "gagneLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GainXp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GainXp_gagneLe_idx" ON "GainXp"("gagneLe");

-- CreateIndex
CREATE UNIQUE INDEX "GainXp_utilisateurId_source_cle_key" ON "GainXp"("utilisateurId", "source", "cle");

-- CreateIndex
CREATE INDEX "Notification_utilisateurId_lu_idx" ON "Notification"("utilisateurId", "lu");

-- AddForeignKey
ALTER TABLE "GainXp" ADD CONSTRAINT "GainXp_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

