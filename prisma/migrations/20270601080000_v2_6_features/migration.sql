-- v2.6 · índice de texto en apuntes, paquetes de estudio, progreso del juego y formato de examen
-- AlterTable
ALTER TABLE "StudyModule" ADD COLUMN     "examFormat" JSONB;

-- CreateTable
CREATE TABLE "StudyTopicPack" (
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
CREATE TABLE "QuestProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyTopicPack_topicId_key" ON "StudyTopicPack"("topicId");

-- CreateIndex
CREATE INDEX "StudyTopicPack_userId_idx" ON "StudyTopicPack"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestProgress_userId_moduleId_key" ON "QuestProgress"("userId", "moduleId");

-- AddForeignKey
ALTER TABLE "StudyTopicPack" ADD CONSTRAINT "StudyTopicPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTopicPack" ADD CONSTRAINT "StudyTopicPack_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StudyTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- v2.6 · Búsqueda por texto en apuntes: to_tsvector('spanish', content) se calculaba por fila en cada consulta.
-- Índice GIN de expresión (la consulta de rag.ts usa exactamente esa expresión). Aditivo; Prisma no lo modela.
CREATE INDEX IF NOT EXISTS "DocumentChunk_content_tsv_idx"
  ON "DocumentChunk" USING gin (to_tsvector('spanish', "content"));
