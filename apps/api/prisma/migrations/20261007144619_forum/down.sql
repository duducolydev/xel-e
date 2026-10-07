-- Rollback for migration 20261007144619_forum (hand-written, Prisma has no down-migrations).
DROP TABLE "PieceJointe";
DROP TABLE "TermeInterdit";

DROP INDEX "Message_sujetId_createdAt_idx";
DROP INDEX "Signalement_traiteLe_idx";
DROP INDEX "SujetForum_niveauId_matiereId_dernierMessageLe_idx";

ALTER TABLE "Message" DROP COLUMN "masqueLe", DROP COLUMN "verifieLe";
ALTER TABLE "Signalement" DROP COLUMN "traiteLe";
ALTER TABLE "SujetForum" DROP COLUMN "dernierMessageLe";

CREATE INDEX "Message_sujetId_idx" ON "Message"("sujetId");
CREATE INDEX "SujetForum_niveauId_matiereId_idx" ON "SujetForum"("niveauId", "matiereId");

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261007144619_forum';
