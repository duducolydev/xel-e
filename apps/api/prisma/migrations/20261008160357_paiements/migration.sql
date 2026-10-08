-- CreateEnum
CREATE TYPE "StatutEvenement" AS ENUM ('RECU', 'TRAITE', 'ECHEC');

-- DropForeignKey
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_abonnementId_fkey";

-- DropIndex
DROP INDEX "Paiement_abonnementId_idx";

-- AlterTable
ALTER TABLE "Abonnement" ADD COLUMN     "debutLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "relanceLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Paiement" ADD COLUMN     "beneficiaireId" TEXT NOT NULL,
ADD COLUMN     "confirmeLe" TIMESTAMP(3),
ADD COLUMN     "devise" TEXT NOT NULL DEFAULT 'XOF',
ADD COLUMN     "jetonNotification" TEXT,
ADD COLUMN     "numeroRecu" TEXT,
ADD COLUMN     "payeurId" TEXT NOT NULL,
ADD COLUMN     "planId" TEXT NOT NULL,
ADD COLUMN     "referenceInterne" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "urlPaiement" TEXT,
ALTER COLUMN "abonnementId" DROP NOT NULL,
ALTER COLUMN "refExterne" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "prixFcfa" INTEGER NOT NULL,
    "dureeMois" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "aConfirmer" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementPaiement" (
    "id" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "idEvenement" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "charge" JSONB NOT NULL,
    "statut" "StatutEvenement" NOT NULL DEFAULT 'RECU',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "derniereErreur" TEXT,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteLe" TIMESTAMP(3),

    CONSTRAINT "EvenementPaiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteurRecu" (
    "annee" INTEGER NOT NULL,
    "valeur" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompteurRecu_pkey" PRIMARY KEY ("annee")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "EvenementPaiement_statut_idx" ON "EvenementPaiement"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "EvenementPaiement_fournisseur_idEvenement_key" ON "EvenementPaiement"("fournisseur", "idEvenement");

-- CreateIndex
CREATE INDEX "Abonnement_statut_expireLe_idx" ON "Abonnement"("statut", "expireLe");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_abonnementId_key" ON "Paiement"("abonnementId");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_referenceInterne_key" ON "Paiement"("referenceInterne");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_numeroRecu_key" ON "Paiement"("numeroRecu");

-- CreateIndex
CREATE INDEX "Paiement_payeurId_idx" ON "Paiement"("payeurId");

-- CreateIndex
CREATE INDEX "Paiement_beneficiaireId_idx" ON "Paiement"("beneficiaireId");

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_payeurId_fkey" FOREIGN KEY ("payeurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_beneficiaireId_fkey" FOREIGN KEY ("beneficiaireId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Offres Premium (prix provisoires en FCFA, à confirmer par l'administration).
INSERT INTO "Plan" ("id", "code", "libelle", "prixFcfa", "dureeMois", "actif", "aConfirmer", "ordre", "updatedAt") VALUES
  ('4f0f7f2e-7c3b-4d61-9a4e-1b2c3d4e5f60', 'PREMIUM_MENSUEL', 'Premium mensuel', 1500, 1, true, true, 1, CURRENT_TIMESTAMP),
  ('4f0f7f2e-7c3b-4d61-9a4e-1b2c3d4e5f61', 'PREMIUM_ANNUEL', 'Premium annuel', 15000, 12, true, true, 2, CURRENT_TIMESTAMP);
