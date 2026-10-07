-- DropIndex
DROP INDEX "Message_sujetId_idx";

-- DropIndex
DROP INDEX "SujetForum_niveauId_matiereId_idx";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "masqueLe" TIMESTAMP(3),
ADD COLUMN     "verifieLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Signalement" ADD COLUMN     "traiteLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SujetForum" ADD COLUMN     "dernierMessageLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PieceJointe" (
    "id" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "messageId" TEXT,
    "cle" TEXT NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceJointe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermeInterdit" (
    "id" TEXT NOT NULL,
    "terme" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermeInterdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PieceJointe_cle_key" ON "PieceJointe"("cle");

-- CreateIndex
CREATE INDEX "PieceJointe_messageId_idx" ON "PieceJointe"("messageId");

-- CreateIndex
CREATE INDEX "PieceJointe_auteurId_idx" ON "PieceJointe"("auteurId");

-- CreateIndex
CREATE UNIQUE INDEX "TermeInterdit_terme_key" ON "TermeInterdit"("terme");

-- CreateIndex
CREATE INDEX "Message_sujetId_createdAt_idx" ON "Message"("sujetId", "createdAt");

-- CreateIndex
CREATE INDEX "Signalement_traiteLe_idx" ON "Signalement"("traiteLe");

-- CreateIndex
CREATE INDEX "SujetForum_niveauId_matiereId_dernierMessageLe_idx" ON "SujetForum"("niveauId", "matiereId", "dernierMessageLe");

-- AddForeignKey
ALTER TABLE "PieceJointe" ADD CONSTRAINT "PieceJointe_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceJointe" ADD CONSTRAINT "PieceJointe_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Liste de départ du filtre du forum (src/forum/termes-initiaux.ts), éditable ensuite par l'administration.
INSERT INTO "TermeInterdit" ("id", "terme") VALUES
  ('90a9d568-0813-4d2e-9b4d-73a7f44bf2d0', 'abruti'),
  ('4d8925d3-0cd2-4d8a-a956-6386fded7d41', 'attardé'),
  ('d6a35272-6d3a-4893-b75d-3fd4b240dea6', 'bamboula'),
  ('6d316998-c3aa-46ee-92d0-ace87227ff49', 'bâtard'),
  ('266926eb-5914-4fc6-b9d2-466df87917c5', 'bite'),
  ('86d65de4-38af-49db-b34a-a2a0364a49e7', 'bougnoule'),
  ('4e60d191-52df-42fa-8a02-ab94d3cd1a6b', 'branlette'),
  ('0355500e-068f-4063-916e-7f1fb4774d61', 'branleur'),
  ('f8eb245f-44fe-4765-a973-ab369cbec108', 'connard'),
  ('6c80efe0-1b8a-4d85-8e7d-1f19ea60992c', 'connasse'),
  ('4a7b73ab-eb89-4dd0-99ba-b055eee81822', 'couilles'),
  ('a388bd8a-9bbc-443d-9414-5a91354397a3', 'enculé'),
  ('3d7dd371-b778-43d7-82d2-6ad84a568875', 'enculer'),
  ('9d0cce2b-46f1-4f9e-a63e-a9d94513ba49', 'fdp'),
  ('a0844864-07a0-4b84-9b54-ed07b257caa8', 'ferme ta gueule'),
  ('b36023c7-96c4-4b49-85c9-20c6d865c738', 'fils de pute'),
  ('de989db4-5c62-441f-b073-26c85368e967', 'gouine'),
  ('579ae225-69f9-43cb-b4d5-244d249b9260', 'grognasse'),
  ('7c2265e3-bf28-4e2e-a31c-f05cd19db799', 'mongol'),
  ('9b553a56-4537-446c-93e8-c754cd870817', 'nègre'),
  ('8dccee1e-e463-427b-87b5-8166b6a9fb92', 'negro'),
  ('828e031e-64e8-4545-83f2-2eb6c7b990b1', 'nique ta mère'),
  ('2927129c-96dc-47b1-8622-403d91dfef2e', 'nique ta race'),
  ('2a019b44-4050-4431-94fc-0dd00d7952a2', 'ntm'),
  ('7323dcf2-d241-4ad7-a865-420a8e2860c1', 'nude'),
  ('9450a27a-3e30-4a7c-a1ff-be3a50b1ab75', 'nudes'),
  ('392ef39d-00a0-436d-8f3d-1757f6464eb2', 'pd'),
  ('e9f38cda-5d1f-4119-95eb-eef01b53e0b1', 'pédé'),
  ('4fbb53c7-d74e-457c-8c54-7e8aba175820', 'pétasse'),
  ('a18c1fb3-8cc5-4534-9db3-2a9fecea3532', 'porno'),
  ('d999a76f-5a83-49a8-83a8-c688ef528032', 'pouffiasse'),
  ('cea0eb5f-5b7b-432f-9d29-f12cc93ceeff', 'pute'),
  ('8079c8b3-6e84-4cfd-a2c4-bfb970613b96', 'putain'),
  ('e72e5353-3433-49be-9dcb-98093ebf8ccb', 'salaud'),
  ('a8b98818-2192-4ca2-9ee5-1cc725ee784f', 'sale arabe'),
  ('40293f9b-410f-457a-921e-ef6fecc69408', 'sale juif'),
  ('e60119ce-a916-4cad-8d54-07de77bf9add', 'sale noir'),
  ('60742273-cfce-4bf5-b2a8-1969cb9456cc', 'salope'),
  ('ac6fa538-c152-43d2-a2d8-79a19dbdd365', 'suicide toi'),
  ('8f91bc04-aef7-437d-8f22-33d7c4dc7ab0', 'ta gueule'),
  ('ceb54414-64f3-47fd-8d12-6e1ab5990a8c', 'tapette'),
  ('d2ab4992-a65f-4567-9b31-9e2f508e6069', 'tg'),
  ('f1fbf7ba-55cd-4213-bd41-6434cfb2bd0b', 'va crever'),
  ('b7a7f03b-876a-4d74-90ee-4e998cf9da38', 'va mourir'),
  ('127e47b4-73ec-4329-ba7f-4de124633ae3', 'va te pendre'),
  ('e8af1c12-6449-426b-a1b6-706fbcdb46a4', 'youpin');
