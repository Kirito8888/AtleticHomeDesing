-- solo añade índices por userId, StudyModule, StudyTopic y StudyDocument.moduleId
-- AlterTable
ALTER TABLE "StudyDocument" ADD COLUMN     "moduleId" TEXT;

-- CreateTable
CREATE TABLE "StudyModule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examDate" DATE,
    "prepMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT 'yellow',
    "minutes" INTEGER NOT NULL DEFAULT 30,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyModule_userId_idx" ON "StudyModule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyModule_userId_name_key" ON "StudyModule"("userId", "name");

-- CreateIndex
CREATE INDEX "StudyTopic_moduleId_idx" ON "StudyTopic"("moduleId");

-- CreateIndex
CREATE INDEX "StudyTopic_userId_idx" ON "StudyTopic"("userId");

-- CreateIndex
CREATE INDEX "CalendarFeed_userId_idx" ON "CalendarFeed"("userId");

-- CreateIndex
CREATE INDEX "HabitLog_userId_idx" ON "HabitLog"("userId");

-- CreateIndex
CREATE INDEX "PlanFeedback_userId_idx" ON "PlanFeedback"("userId");

-- CreateIndex
CREATE INDEX "PrehabLog_userId_idx" ON "PrehabLog"("userId");

-- CreateIndex
CREATE INDEX "ReturnProtocol_userId_idx" ON "ReturnProtocol"("userId");

-- CreateIndex
CREATE INDEX "RoutineTest_userId_idx" ON "RoutineTest"("userId");

-- CreateIndex
CREATE INDEX "SharedReport_userId_idx" ON "SharedReport"("userId");

-- CreateIndex
CREATE INDEX "StudyDocument_moduleId_idx" ON "StudyDocument"("moduleId");

-- AddForeignKey
ALTER TABLE "StudyDocument" ADD CONSTRAINT "StudyDocument_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyModule" ADD CONSTRAINT "StudyModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTopic" ADD CONSTRAINT "StudyTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTopic" ADD CONSTRAINT "StudyTopic_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "StudyModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTopic" ADD CONSTRAINT "StudyTopic_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

