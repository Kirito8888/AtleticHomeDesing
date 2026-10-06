-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN     "prefs" JSONB;

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "sport" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlanDay" ADD COLUMN     "light" JSONB,
ADD COLUMN     "mode" TEXT;

-- AlterTable
ALTER TABLE "PlanMeso" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'IMPORT',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "RecoveryMetrics" ADD COLUMN     "bodyFatPct" DOUBLE PRECISION,
ADD COLUMN     "elbowSymptoms" BOOLEAN,
ADD COLUMN     "heelPain" INTEGER,
ADD COLUMN     "jumpCm" DOUBLE PRECISION,
ADD COLUMN     "squeezePain" INTEGER;

-- AlterTable
ALTER TABLE "TechnicalSession" ADD COLUMN     "videoElbowOk" INTEGER,
ADD COLUMN     "videoHeadOk" INTEGER,
ADD COLUMN     "videoTotal" INTEGER;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "feelings" JSONB;

-- CreateTable
CREATE TABLE "PlanFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mesoId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "rating" TEXT NOT NULL,
    "pain" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleProfile" (
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CycleLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneRepMax" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "perHand" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneRepMax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "rmKey" TEXT,
    "exerciseId" TEXT,

    CONSTRAINT "ExerciseAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "includeInjuries" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeedback_mesoId_week_key" ON "PlanFeedback"("mesoId", "week");

-- CreateIndex
CREATE UNIQUE INDEX "CycleLog_userId_date_key" ON "CycleLog"("userId", "date");

-- CreateIndex
CREATE INDEX "OneRepMax_userId_nameKey_effectiveFrom_idx" ON "OneRepMax"("userId", "nameKey", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAlias_userId_key_key" ON "ExerciseAlias"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeed_tokenHash_key" ON "CalendarFeed"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SharedReport_tokenHash_key" ON "SharedReport"("tokenHash");

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_mesoId_fkey" FOREIGN KEY ("mesoId") REFERENCES "PlanMeso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleProfile" ADD CONSTRAINT "CycleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleLog" ADD CONSTRAINT "CycleLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneRepMax" ADD CONSTRAINT "OneRepMax_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlias" ADD CONSTRAINT "ExerciseAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedReport" ADD CONSTRAINT "SharedReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

