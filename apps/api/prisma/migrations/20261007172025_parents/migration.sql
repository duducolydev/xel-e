-- CreateEnum
CREATE TYPE "FrequenceResume" AS ENUM ('HEBDOMADAIRE', 'MENSUELLE', 'AUCUNE');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateTable
CREATE TABLE "CodeLiaison" (
    "id" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeLiaison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiviteJour" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "jour" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActiviteJour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferencesParent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "frequence" "FrequenceResume" NOT NULL DEFAULT 'HEBDOMADAIRE',
    "email" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "telephone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreferencesParent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeEnvoye" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "envoyeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeEnvoye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodeLiaison_codeHash_key" ON "CodeLiaison"("codeHash");

-- CreateIndex
CREATE INDEX "CodeLiaison_eleveId_idx" ON "CodeLiaison"("eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiviteJour_utilisateurId_jour_key" ON "ActiviteJour"("utilisateurId", "jour");

-- CreateIndex
CREATE UNIQUE INDEX "PreferencesParent_parentId_key" ON "PreferencesParent"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeEnvoye_parentId_periode_canal_key" ON "ResumeEnvoye"("parentId", "periode", "canal");

-- AddForeignKey
ALTER TABLE "CodeLiaison" ADD CONSTRAINT "CodeLiaison_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiviteJour" ADD CONSTRAINT "ActiviteJour_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferencesParent" ADD CONSTRAINT "PreferencesParent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeEnvoye" ADD CONSTRAINT "ResumeEnvoye_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

