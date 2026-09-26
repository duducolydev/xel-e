-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('ACTIF', 'EN_ATTENTE_VALIDATION');

-- CreateEnum
CREATE TYPE "TypeJetonVerification" AS ENUM ('CONFIRMATION_EMAIL', 'REINITIALISATION_MOT_DE_PASSE', 'CONSENTEMENT_PARENTAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentementParentalLe" TIMESTAMP(3),
ADD COLUMN     "contactParentEmail" TEXT,
ADD COLUMN     "emailConfirmeLe" TIMESTAMP(3),
ADD COLUMN     "naissanceAnnee" INTEGER,
ADD COLUMN     "naissanceMois" INTEGER,
ADD COLUMN     "statutCompte" "StatutCompte" NOT NULL DEFAULT 'ACTIF';

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "revoqueLe" TIMESTAMP(3),
    "remplaceParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JetonVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TypeJetonVerification" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familleId_idx" ON "RefreshToken"("familleId");

-- CreateIndex
CREATE UNIQUE INDEX "JetonVerification_tokenHash_key" ON "JetonVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "JetonVerification_userId_type_idx" ON "JetonVerification"("userId", "type");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JetonVerification" ADD CONSTRAINT "JetonVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
