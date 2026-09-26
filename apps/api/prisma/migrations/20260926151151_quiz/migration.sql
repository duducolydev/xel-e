-- DropIndex
DROP INDEX "Tentative_utilisateurId_idx";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "explication" TEXT;

-- AlterTable
ALTER TABLE "Tentative" ADD COLUMN     "correction" JSONB,
ADD COLUMN     "enCoursCle" TEXT,
ADD COLUMN     "pointsObtenus" DOUBLE PRECISION,
ADD COLUMN     "pointsTotal" DOUBLE PRECISION,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Tentative_enCoursCle_key" ON "Tentative"("enCoursCle");

-- CreateIndex
CREATE INDEX "Tentative_utilisateurId_termineLe_idx" ON "Tentative"("utilisateurId", "termineLe");

