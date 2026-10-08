-- CreateTable
CREATE TABLE "EpreuveBfem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "matiere" TEXT,
    "dureeMinutes" INTEGER,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "ordre" INTEGER NOT NULL,
    "aVerifier" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpreuveBfem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annale" (
    "id" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "sujetCle" TEXT NOT NULL,
    "corrigeCle" TEXT,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamenBlanc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "consignes" TEXT NOT NULL DEFAULT '',
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "publie" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamenBlanc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionExamen" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "type" "TypeQuestion" NOT NULL,
    "enonce" TEXT NOT NULL,
    "choix" JSONB,
    "reponseCorrecte" JSONB NOT NULL,
    "explication" TEXT,
    "bareme" INTEGER NOT NULL DEFAULT 1,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "QuestionExamen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopieExamen" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "reponses" JSONB NOT NULL DEFAULT '{}',
    "demarreLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "enCoursCle" TEXT,
    "soumiseLe" TIMESTAMP(3),
    "soumissionAuto" BOOLEAN NOT NULL DEFAULT false,
    "note" DOUBLE PRECISION,
    "pointsObtenus" DOUBLE PRECISION,
    "pointsTotal" DOUBLE PRECISION,
    "correction" JSONB,

    CONSTRAINT "CopieExamen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimationBfem" (
    "id" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "note" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimationBfem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EpreuveBfem_code_key" ON "EpreuveBfem"("code");

-- CreateIndex
CREATE INDEX "Annale_epreuveId_annee_idx" ON "Annale"("epreuveId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "ExamenBlanc_slug_key" ON "ExamenBlanc"("slug");

-- CreateIndex
CREATE INDEX "QuestionExamen_examenId_idx" ON "QuestionExamen"("examenId");

-- CreateIndex
CREATE UNIQUE INDEX "CopieExamen_enCoursCle_key" ON "CopieExamen"("enCoursCle");

-- CreateIndex
CREATE INDEX "CopieExamen_eleveId_soumiseLe_idx" ON "CopieExamen"("eleveId", "soumiseLe");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationBfem_eleveId_epreuveId_key" ON "EstimationBfem"("eleveId", "epreuveId");

-- AddForeignKey
ALTER TABLE "Annale" ADD CONSTRAINT "Annale_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "EpreuveBfem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamenBlanc" ADD CONSTRAINT "ExamenBlanc_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "EpreuveBfem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionExamen" ADD CONSTRAINT "QuestionExamen_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "ExamenBlanc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopieExamen" ADD CONSTRAINT "CopieExamen_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "ExamenBlanc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopieExamen" ADD CONSTRAINT "CopieExamen_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimationBfem" ADD CONSTRAINT "EstimationBfem_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimationBfem" ADD CONSTRAINT "EstimationBfem_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "EpreuveBfem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Épreuves du BFEM (src/bfem/epreuves-initiales.ts) : durées et coefficients provisoires, à confirmer par l'administration.
INSERT INTO "EpreuveBfem" ("id", "code", "libelle", "matiere", "dureeMinutes", "coefficient", "ordre", "aVerifier", "updatedAt") VALUES
  ('b93515d7-9b59-4d91-b14b-f9599be175bc', 'FRANCAIS', 'Français', NULL, NULL, 1, 1, true, CURRENT_TIMESTAMP),
  ('8485060c-75db-4aa7-a06b-dc7830fc24e8', 'MATHS', 'Mathématiques', 'Maths', 120, 1, 2, true, CURRENT_TIMESTAMP),
  ('d8179d59-e7b5-4aa0-8dcc-133892a98e19', 'PC', 'Sciences physiques', 'PC', 60, 1, 3, true, CURRENT_TIMESTAMP),
  ('8351c59a-cdda-4e3d-85c9-d97ac655aa43', 'SVT', 'Sciences de la vie et de la Terre', 'SVT', 60, 1, 4, true, CURRENT_TIMESTAMP),
  ('c83132ad-7bf8-4290-ba54-b08f567ce138', 'HISTOIRE_GEO', 'Histoire-Géographie', NULL, NULL, 1, 5, true, CURRENT_TIMESTAMP),
  ('3a721f6f-eb29-4500-bb92-b6c7e998fb57', 'ANGLAIS', 'Anglais', NULL, NULL, 1, 6, true, CURRENT_TIMESTAMP),
  ('4a7d9433-c44d-42ab-adb7-4fe6df198de4', 'LV2', 'Deuxième langue', NULL, NULL, 1, 7, true, CURRENT_TIMESTAMP),
  ('b4e5effa-e04e-43c4-91a4-89d836a11f5a', 'EPS', 'Éducation physique et sportive', NULL, NULL, 1, 8, true, CURRENT_TIMESTAMP);
