-- Rollback for migration 20261008160357_paiements (hand-written, Prisma has no down-migrations).
-- Les paiements créés depuis cette migration n'ont pas d'équivalent dans l'ancien schéma : ils sont
-- supprimés (retour arrière destructif, à n'utiliser qu'avant la mise en production des paiements).
DELETE FROM "Paiement";

ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_payeurId_fkey";
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_beneficiaireId_fkey";
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_planId_fkey";
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_abonnementId_fkey";
DROP INDEX "Paiement_abonnementId_key";
DROP INDEX "Paiement_referenceInterne_key";
DROP INDEX "Paiement_numeroRecu_key";
DROP INDEX "Paiement_payeurId_idx";
DROP INDEX "Paiement_beneficiaireId_idx";
ALTER TABLE "Paiement"
  DROP COLUMN "beneficiaireId",
  DROP COLUMN "confirmeLe",
  DROP COLUMN "devise",
  DROP COLUMN "jetonNotification",
  DROP COLUMN "numeroRecu",
  DROP COLUMN "payeurId",
  DROP COLUMN "planId",
  DROP COLUMN "referenceInterne",
  DROP COLUMN "updatedAt",
  DROP COLUMN "urlPaiement",
  ALTER COLUMN "abonnementId" SET NOT NULL,
  ALTER COLUMN "refExterne" SET NOT NULL;
CREATE INDEX "Paiement_abonnementId_idx" ON "Paiement"("abonnementId");
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Abonnement_statut_expireLe_idx";
ALTER TABLE "Abonnement" DROP COLUMN "debutLe", DROP COLUMN "relanceLe";

DROP TABLE "CompteurRecu";
DROP TABLE "EvenementPaiement";
DROP TABLE "Plan";
DROP TYPE "StatutEvenement";

-- Lets `prisma migrate deploy` re-apply this migration afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261008160357_paiements';
