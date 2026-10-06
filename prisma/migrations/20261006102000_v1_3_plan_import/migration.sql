-- CreateTable
CREATE TABLE "PlanMeso" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "version" TEXT,
    "intro" JSONB NOT NULL,
    "annexes" JSONB NOT NULL DEFAULT '[]',
    "weeks" JSONB NOT NULL,
    "variants" JSONB NOT NULL,
    "variant" TEXT,
    "anchorDate" DATE,
    "cycleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanMeso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mesoId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "variant" TEXT,
    "week" INTEGER,
    "code" TEXT NOT NULL,
    "date" DATE,
    "relDay" INTEGER,
    "title" TEXT NOT NULL,
    "durationMin" INTEGER,
    "competition" BOOLEAN NOT NULL DEFAULT false,
    "type" "SessionType" NOT NULL,
    "weekTitle" TEXT,
    "content" JSONB NOT NULL,
    "sessionId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanMeso_userId_code_key" ON "PlanMeso"("userId", "code");

-- CreateIndex
CREATE INDEX "PlanDay_userId_date_idx" ON "PlanDay"("userId", "date");

-- CreateIndex
CREATE INDEX "PlanDay_sessionId_idx" ON "PlanDay"("sessionId");

-- CreateIndex
CREATE INDEX "PlanDay_mesoId_idx" ON "PlanDay"("mesoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDay_userId_key_key" ON "PlanDay"("userId", "key");

-- AddForeignKey
ALTER TABLE "PlanMeso" ADD CONSTRAINT "PlanMeso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDay" ADD CONSTRAINT "PlanDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDay" ADD CONSTRAINT "PlanDay_mesoId_fkey" FOREIGN KEY ("mesoId") REFERENCES "PlanMeso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

