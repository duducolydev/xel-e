-- Rollback for migration 20260926133934_auth (hand-written, Prisma has no down-migrations).
DROP TABLE "JetonVerification";
DROP TABLE "RefreshToken";

ALTER TABLE "User"
  DROP COLUMN "consentementParentalLe",
  DROP COLUMN "contactParentEmail",
  DROP COLUMN "emailConfirmeLe",
  DROP COLUMN "naissanceAnnee",
  DROP COLUMN "naissanceMois",
  DROP COLUMN "statutCompte";

DROP TYPE "TypeJetonVerification";
DROP TYPE "StatutCompte";

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926133934_auth';
