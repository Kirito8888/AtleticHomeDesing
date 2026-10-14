-- v2.1: primaryEvent, vídeo de ejercicio, curvas y fisio
-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN     "primaryEvent" TEXT;

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "videoBytes" INTEGER,
ADD COLUMN     "videoMime" TEXT,
ADD COLUMN     "videoPath" TEXT;

-- CreateTable
CREATE TABLE "ReferenceCurve" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "global" BOOLEAN NOT NULL DEFAULT false,
    "testKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "higherIsBetter" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "sex" "Sex",
    "level" TEXT,
    "discipline" "Discipline",
    "study" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "citation" TEXT NOT NULL,
    "doi" TEXT,
    "sourceUrl" TEXT,
    "points" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceCurve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioProtocol" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" "BodyArea",
    "notes" TEXT,
    "phases" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysioProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioProtocolShare" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "progress" JSONB NOT NULL,
    "painToday" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysioProtocolShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceCurve_testKey_idx" ON "ReferenceCurve"("testKey");

-- CreateIndex
CREATE INDEX "ReferenceCurve_createdById_idx" ON "ReferenceCurve"("createdById");

-- CreateIndex
CREATE INDEX "PhysioProtocol_ownerId_idx" ON "PhysioProtocol"("ownerId");

-- CreateIndex
CREATE INDEX "PhysioProtocolShare_athleteId_idx" ON "PhysioProtocolShare"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysioProtocolShare_protocolId_athleteId_key" ON "PhysioProtocolShare"("protocolId", "athleteId");

-- AddForeignKey
ALTER TABLE "ReferenceCurve" ADD CONSTRAINT "ReferenceCurve_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioProtocol" ADD CONSTRAINT "PhysioProtocol_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioProtocolShare" ADD CONSTRAINT "PhysioProtocolShare_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "PhysioProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioProtocolShare" ADD CONSTRAINT "PhysioProtocolShare_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioProtocolShare" ADD CONSTRAINT "PhysioProtocolShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

