-- AlterTable
ALTER TABLE "Lecon" ADD COLUMN     "quizBrouillon" JSONB,
ADD COLUMN     "soumisLe" TIMESTAMP(3),
ADD COLUMN     "vues" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CommentaireRevue" (
    "id" TEXT NOT NULL,
    "leconId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentaireRevue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentaireRevue_leconId_idx" ON "CommentaireRevue"("leconId");

-- AddForeignKey
ALTER TABLE "CommentaireRevue" ADD CONSTRAINT "CommentaireRevue_leconId_fkey" FOREIGN KEY ("leconId") REFERENCES "Lecon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentaireRevue" ADD CONSTRAINT "CommentaireRevue_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

