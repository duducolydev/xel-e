-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ELEVE', 'PROFESSEUR', 'PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatutLecon" AS ENUM ('BROUILLON', 'EN_REVUE', 'PUBLIE');

-- CreateEnum
CREATE TYPE "TypeQuestion" AS ENUM ('QCM', 'VRAI_FAUX', 'REPONSE_COURTE');

-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('ACTIF', 'EXPIRE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ECHOUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "identifiant" TEXT,
    "motDePasseHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "pseudonyme" TEXT,
    "niveauId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "enfantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Niveau" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "Niveau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matiere" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "Matiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapitre" (
    "id" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapitre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lecon" (
    "id" TEXT NOT NULL,
    "chapitreId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT,
    "statut" "StatutLecon" NOT NULL DEFAULT 'BROUILLON',
    "version" INTEGER NOT NULL DEFAULT 1,
    "ordre" INTEGER NOT NULL,
    "auteurId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lecon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "leconId" TEXT NOT NULL,
    "dureeMax" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "type" "TypeQuestion" NOT NULL,
    "enonce" TEXT NOT NULL,
    "choix" JSONB,
    "reponseCorrecte" JSONB NOT NULL,
    "bareme" INTEGER NOT NULL DEFAULT 1,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tentative" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "reponses" JSONB,
    "score" DOUBLE PRECISION,
    "demarreLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termineLe" TIMESTAMP(3),

    CONSTRAINT "Tentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Progression" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "leconId" TEXT NOT NULL,
    "pourcentage" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "termineLe" TIMESTAMP(3),

    CONSTRAINT "Progression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeUtilisateur" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "obtenuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeUtilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SujetForum" (
    "id" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SujetForum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sujetId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "masque" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signalement" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "signalantId" TEXT NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signalement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abonnement" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "statut" "StatutAbonnement" NOT NULL DEFAULT 'ACTIF',
    "expireLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'EN_ATTENTE',
    "montant" INTEGER NOT NULL,
    "refExterne" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_identifiant_key" ON "User"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "User_pseudonyme_key" ON "User"("pseudonyme");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_niveauId_idx" ON "User"("niveauId");

-- CreateIndex
CREATE INDEX "ParentLink_enfantId_idx" ON "ParentLink"("enfantId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLink_parentId_enfantId_key" ON "ParentLink"("parentId", "enfantId");

-- CreateIndex
CREATE UNIQUE INDEX "Niveau_libelle_key" ON "Niveau"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "Niveau_ordre_key" ON "Niveau"("ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Matiere_libelle_key" ON "Matiere"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "Chapitre_niveauId_matiereId_ordre_key" ON "Chapitre"("niveauId", "matiereId", "ordre");

-- CreateIndex
CREATE INDEX "Lecon_statut_idx" ON "Lecon"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "Lecon_chapitreId_ordre_key" ON "Lecon"("chapitreId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_leconId_key" ON "Quiz"("leconId");

-- CreateIndex
CREATE INDEX "Question_quizId_idx" ON "Question"("quizId");

-- CreateIndex
CREATE INDEX "Tentative_quizId_idx" ON "Tentative"("quizId");

-- CreateIndex
CREATE INDEX "Tentative_utilisateurId_idx" ON "Tentative"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "Progression_utilisateurId_leconId_key" ON "Progression"("utilisateurId", "leconId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeUtilisateur_utilisateurId_badgeId_key" ON "BadgeUtilisateur"("utilisateurId", "badgeId");

-- CreateIndex
CREATE INDEX "SujetForum_niveauId_matiereId_idx" ON "SujetForum"("niveauId", "matiereId");

-- CreateIndex
CREATE INDEX "Message_sujetId_idx" ON "Message"("sujetId");

-- CreateIndex
CREATE UNIQUE INDEX "Signalement_messageId_signalantId_key" ON "Signalement"("messageId", "signalantId");

-- CreateIndex
CREATE INDEX "Abonnement_utilisateurId_idx" ON "Abonnement"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_refExterne_key" ON "Paiement"("refExterne");

-- CreateIndex
CREATE INDEX "Paiement_abonnementId_idx" ON "Paiement"("abonnementId");

-- CreateIndex
CREATE INDEX "Notification_utilisateurId_idx" ON "Notification"("utilisateurId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "Niveau"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_enfantId_fkey" FOREIGN KEY ("enfantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapitre" ADD CONSTRAINT "Chapitre_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "Niveau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapitre" ADD CONSTRAINT "Chapitre_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "Matiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecon" ADD CONSTRAINT "Lecon_chapitreId_fkey" FOREIGN KEY ("chapitreId") REFERENCES "Chapitre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecon" ADD CONSTRAINT "Lecon_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_leconId_fkey" FOREIGN KEY ("leconId") REFERENCES "Lecon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tentative" ADD CONSTRAINT "Tentative_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tentative" ADD CONSTRAINT "Tentative_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progression" ADD CONSTRAINT "Progression_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progression" ADD CONSTRAINT "Progression_leconId_fkey" FOREIGN KEY ("leconId") REFERENCES "Lecon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeUtilisateur" ADD CONSTRAINT "BadgeUtilisateur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeUtilisateur" ADD CONSTRAINT "BadgeUtilisateur_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SujetForum" ADD CONSTRAINT "SujetForum_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "Niveau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SujetForum" ADD CONSTRAINT "SujetForum_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "Matiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SujetForum" ADD CONSTRAINT "SujetForum_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sujetId_fkey" FOREIGN KEY ("sujetId") REFERENCES "SujetForum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signalement" ADD CONSTRAINT "Signalement_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signalement" ADD CONSTRAINT "Signalement_signalantId_fkey" FOREIGN KEY ("signalantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
