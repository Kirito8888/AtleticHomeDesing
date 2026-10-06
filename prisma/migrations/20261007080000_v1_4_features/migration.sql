-- AlterTable
ALTER TABLE "PlanDay" ADD COLUMN     "light" JSONB,
ADD COLUMN     "mode" TEXT;

-- AlterTable
ALTER TABLE "PlanMeso" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'IMPORT',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

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

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeedback_mesoId_week_key" ON "PlanFeedback"("mesoId", "week");

-- CreateIndex
CREATE UNIQUE INDEX "CycleLog_userId_date_key" ON "CycleLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_mesoId_fkey" FOREIGN KEY ("mesoId") REFERENCES "PlanMeso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleProfile" ADD CONSTRAINT "CycleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleLog" ADD CONSTRAINT "CycleLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

