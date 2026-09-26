-- AlterTable : le slug est ajouté nullable, rempli pour les leçons existantes, puis rendu obligatoire.
ALTER TABLE "Lecon" ADD COLUMN     "slug" TEXT,
ADD COLUMN     "versionPublieeId" TEXT,
ALTER COLUMN "version" SET DEFAULT 0;

UPDATE "Lecon" SET "slug" = 'lecon-' || "id" WHERE "slug" IS NULL;
ALTER TABLE "Lecon" ALTER COLUMN "slug" SET NOT NULL;

-- « version » désigne désormais la dernière version publiée : 0 pour une leçon jamais publiée.
UPDATE "Lecon" SET "version" = 0 WHERE "statut" <> 'PUBLIE';

-- CreateTable
CREATE TABLE "VersionLecon" (
    "id" TEXT NOT NULL,
    "leconId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "resume" TEXT NOT NULL,
    "publieLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publieParId" TEXT,

    CONSTRAINT "VersionLecon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersionLecon_leconId_numero_key" ON "VersionLecon"("leconId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Lecon_slug_key" ON "Lecon"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Lecon_versionPublieeId_key" ON "Lecon"("versionPublieeId");

-- AddForeignKey
ALTER TABLE "Lecon" ADD CONSTRAINT "Lecon_versionPublieeId_fkey" FOREIGN KEY ("versionPublieeId") REFERENCES "VersionLecon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionLecon" ADD CONSTRAINT "VersionLecon_leconId_fkey" FOREIGN KEY ("leconId") REFERENCES "Lecon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionLecon" ADD CONSTRAINT "VersionLecon_publieParId_fkey" FOREIGN KEY ("publieParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une version publiée est immuable : toute modification est refusée par la base elle-même.
CREATE FUNCTION "version_lecon_immuable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Une version publiée de leçon est immuable (id %).', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "version_lecon_immuable"
  BEFORE UPDATE ON "VersionLecon"
  FOR EACH ROW EXECUTE FUNCTION "version_lecon_immuable"();
