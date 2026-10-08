-- Rollback for migration 20261008150439_bfem (hand-written, Prisma has no down-migrations).
DROP TABLE "EstimationBfem";
DROP TABLE "CopieExamen";
DROP TABLE "QuestionExamen";
DROP TABLE "ExamenBlanc";
DROP TABLE "Annale";
DROP TABLE "EpreuveBfem";

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261008150439_bfem';
