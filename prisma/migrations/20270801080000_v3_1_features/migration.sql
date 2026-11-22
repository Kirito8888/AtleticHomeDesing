-- v3.1 · Apple Fitness: token personal, bandeja de entrenos y kcal; solo añade
-- CreateEnum
CREATE TYPE "ExternalWorkoutStatus" AS ENUM ('PENDING', 'MERGED', 'IMPORTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "kcal" INTEGER;

-- CreateTable
CREATE TABLE "PersonalToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PersonalToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "activityName" TEXT NOT NULL,
    "modality" "TrackModality" NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "distanceM" DOUBLE PRECISION,
    "hrAvg" INTEGER,
    "hrMax" INTEGER,
    "kcal" INTEGER,
    "status" "ExternalWorkoutStatus" NOT NULL DEFAULT 'PENDING',
    "sessionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalToken_tokenHash_key" ON "PersonalToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalToken_userId_purpose_key" ON "PersonalToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "ExternalWorkout_userId_status_idx" ON "ExternalWorkout"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalWorkout_userId_source_dedupeKey_key" ON "ExternalWorkout"("userId", "source", "dedupeKey");

-- AddForeignKey
ALTER TABLE "PersonalToken" ADD CONSTRAINT "PersonalToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalWorkout" ADD CONSTRAINT "ExternalWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalWorkout" ADD CONSTRAINT "ExternalWorkout_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

