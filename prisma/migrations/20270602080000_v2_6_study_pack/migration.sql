-- v2.6 · Paquete de estudio por tema, progreso del Modo Juego y formato de examen. Solo añade; idempotente.
-- Va en una migración propia (y no en 20270601080000_v2_6_features) porque esa ya estaba aplicada en servidores en producción y Prisma
-- no reaplica una migración con el mismo nombre. IF NOT EXISTS / DO: sirve en servidores que no la tienen y en los que se repararon a mano.

-- AlterTable
ALTER TABLE "StudyModule" ADD COLUMN IF NOT EXISTS "examFormat" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudyTopicPack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceHash" TEXT NOT NULL DEFAULT '',
    "summary" JSONB,
    "game" JSONB,
    "failures" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTopicPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuestProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudyTopicPack_topicId_key" ON "StudyTopicPack"("topicId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudyTopicPack_userId_idx" ON "StudyTopicPack"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "QuestProgress_userId_moduleId_key" ON "QuestProgress"("userId", "moduleId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudyTopicPack_userId_fkey') THEN
    ALTER TABLE "StudyTopicPack" ADD CONSTRAINT "StudyTopicPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudyTopicPack_topicId_fkey') THEN
    ALTER TABLE "StudyTopicPack" ADD CONSTRAINT "StudyTopicPack_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StudyTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestProgress_userId_fkey') THEN
    ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestProgress_moduleId_fkey') THEN
    ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
