-- Rollback for migration 20260926221201_progression (hand-written, Prisma has no down-migrations).
DROP TABLE "GainXp";
DROP TYPE "SourceXp";

DROP INDEX "Notification_utilisateurId_lu_idx";
CREATE INDEX "Notification_utilisateurId_idx" ON "Notification"("utilisateurId");

ALTER TABLE "User"
  DROP COLUMN "classementActif",
  DROP COLUMN "dernierJourActif",
  DROP COLUMN "serieJours",
  DROP COLUMN "serieRecord";

ALTER TABLE "Tentative" DROP COLUMN "xpGagne";

ALTER TABLE "Progression"
  DROP COLUMN "meilleurScore",
  DROP COLUMN "quizReussiLe",
  ADD COLUMN "pourcentage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0;

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926221201_progression';
