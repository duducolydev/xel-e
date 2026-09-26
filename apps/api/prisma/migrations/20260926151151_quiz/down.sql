-- Rollback for migration 20260926151151_quiz (hand-written, Prisma has no down-migrations).
DROP INDEX "Tentative_utilisateurId_termineLe_idx";
DROP INDEX "Tentative_enCoursCle_key";

ALTER TABLE "Tentative"
  DROP COLUMN "correction",
  DROP COLUMN "enCoursCle",
  DROP COLUMN "pointsObtenus",
  DROP COLUMN "pointsTotal",
  DROP COLUMN "position";

ALTER TABLE "Question" DROP COLUMN "explication";

CREATE INDEX "Tentative_utilisateurId_idx" ON "Tentative"("utilisateurId");

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926151151_quiz';
