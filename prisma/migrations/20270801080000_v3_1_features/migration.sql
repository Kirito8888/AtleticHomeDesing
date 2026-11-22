-- solo añade tablas y columnas
-- CreateEnum
CREATE TYPE "HealthMetric" AS ENUM ('SLEEP_HOURS', 'HRV_SDNN', 'RESTING_HR', 'BODY_WEIGHT');

-- CreateEnum
CREATE TYPE "HealthConflictStatus" AS ENUM ('PENDING', 'KEPT_CURRENT', 'TOOK_INCOMING');

-- CreateEnum
CREATE TYPE "ExternalWorkoutStatus" AS ENUM ('PENDING', 'MERGED', 'IMPORTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "RecoveryMetrics" ADD COLUMN     "healthSync" JSONB,
ADD COLUMN     "hrvSdnnMs" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "kcal" INTEGER;

-- CreateTable
CREATE TABLE "HealthSyncConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric" "HealthMetric" NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "incomingValue" DOUBLE PRECISION NOT NULL,
    "status" "HealthConflictStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HealthSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastSummary" JSONB,
    "testAt" TIMESTAMP(3),
    "testStatus" INTEGER,
    "testSummary" JSONB,

    CONSTRAINT "AppleDelivery_pkey" PRIMARY KEY ("id")
);

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
    "activityType" TEXT,
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
CREATE INDEX "HealthSyncConflict_userId_status_idx" ON "HealthSyncConflict"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSyncConflict_userId_date_metric_key" ON "HealthSyncConflict"("userId", "date", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "AppleDelivery_userId_channel_key" ON "AppleDelivery"("userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalToken_tokenHash_key" ON "PersonalToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalToken_userId_purpose_key" ON "PersonalToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "ExternalWorkout_userId_status_idx" ON "ExternalWorkout"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalWorkout_userId_source_dedupeKey_key" ON "ExternalWorkout"("userId", "source", "dedupeKey");

-- AddForeignKey
ALTER TABLE "HealthSyncConflict" ADD CONSTRAINT "HealthSyncConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleDelivery" ADD CONSTRAINT "AppleDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalToken" ADD CONSTRAINT "PersonalToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalWorkout" ADD CONSTRAINT "ExternalWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalWorkout" ADD CONSTRAINT "ExternalWorkout_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

