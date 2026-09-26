-- Rollback for migration 20260926144107_contenus (hand-written, Prisma has no down-migrations).
DROP TRIGGER "version_lecon_immuable" ON "VersionLecon";
DROP FUNCTION "version_lecon_immuable"();

ALTER TABLE "Lecon" DROP CONSTRAINT "Lecon_versionPublieeId_fkey";
DROP TABLE "VersionLecon";

DROP INDEX "Lecon_slug_key";
DROP INDEX "Lecon_versionPublieeId_key";
ALTER TABLE "Lecon"
  DROP COLUMN "slug",
  DROP COLUMN "versionPublieeId",
  ALTER COLUMN "version" SET DEFAULT 1;

UPDATE "Lecon" SET "version" = 1 WHERE "version" = 0;

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926144107_contenus';
