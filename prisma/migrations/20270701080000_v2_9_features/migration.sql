-- Composición corporal ISAK (cifrada) · índices O10, O11 y O13 (pg_trgm) · histórico de autoevaluación y micro-pasos · bloques de la ruta (StudyPlanBlock.moduleId/topicId)
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "StudyPlanBlock" ADD COLUMN     "moduleId" TEXT,
ADD COLUMN     "topicId" TEXT;

-- CreateTable
CREATE TABLE "StudySelfTestAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "questions" INTEGER,
    "weak" JSONB NOT NULL,
    "answers" JSONB,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySelfTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyMicroSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "stepsDone" INTEGER NOT NULL,
    "stepsTotal" INTEGER NOT NULL,
    "focusMin" INTEGER NOT NULL,
    "restMin" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyMicroSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyComposition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyComposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudySelfTestAttempt_userId_moduleId_takenAt_key" ON "StudySelfTestAttempt"("userId", "moduleId", "takenAt");

-- CreateIndex
CREATE INDEX "StudyMicroSession_userId_completedAt_idx" ON "StudyMicroSession"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyMicroSession_userId_clientKey_key" ON "StudyMicroSession"("userId", "clientKey");

-- CreateIndex
CREATE INDEX "BodyComposition_userId_date_idx" ON "BodyComposition"("userId", "date");

-- CreateIndex
CREATE INDEX "FoodProduct_name_trgm_idx" ON "FoodProduct" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FoodProduct_brand_trgm_idx" ON "FoodProduct" USING GIN ("brand" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SessionComment_athleteId_idx" ON "SessionComment"("athleteId");

-- CreateIndex
CREATE INDEX "SessionComment_authorId_idx" ON "SessionComment"("authorId");

-- CreateIndex
CREATE INDEX "StudyPlanBlock_moduleId_idx" ON "StudyPlanBlock"("moduleId");

-- CreateIndex
CREATE INDEX "StudyPlanBlock_topicId_idx" ON "StudyPlanBlock"("topicId");

-- AddForeignKey
ALTER TABLE "StudySelfTestAttempt" ADD CONSTRAINT "StudySelfTestAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySelfTestAttempt" ADD CONSTRAINT "StudySelfTestAttempt_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyMicroSession" ADD CONSTRAINT "StudyMicroSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyComposition" ADD CONSTRAINT "BodyComposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanBlock" ADD CONSTRAINT "StudyPlanBlock_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanBlock" ADD CONSTRAINT "StudyPlanBlock_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StudyTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

