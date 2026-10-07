-- Rollback for migration 20261007172025_parents (hand-written, Prisma has no down-migrations).
DROP TABLE "ResumeEnvoye";
DROP TABLE "PreferencesParent";
DROP TABLE "ActiviteJour";
DROP TABLE "CodeLiaison";

DROP TYPE "CanalNotification";
DROP TYPE "FrequenceResume";

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261007172025_parents';
