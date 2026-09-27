-- Rollback for migration 20260926225430_studio (hand-written, Prisma has no down-migrations).
DROP TABLE "CommentaireRevue";

ALTER TABLE "Lecon"
  DROP COLUMN "quizBrouillon",
  DROP COLUMN "soumisLe",
  DROP COLUMN "vues";

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926225430_studio';
