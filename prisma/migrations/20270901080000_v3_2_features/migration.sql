-- v3.2: eventos del club y asistencia (solo añade)
-- CreateEnum
CREATE TYPE "RsvpAnswer" AS ENUM ('YES', 'NO', 'MAYBE');

-- AlterTable
ALTER TABLE "OrgFee" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "OrgEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "feeCents" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgEventResponse" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "answer" "RsvpAnswer" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEventResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgEvent_orgId_startsAt_idx" ON "OrgEvent"("orgId", "startsAt");

-- CreateIndex
CREATE INDEX "OrgEventResponse_memberId_idx" ON "OrgEventResponse"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgEventResponse_eventId_memberId_key" ON "OrgEventResponse"("eventId", "memberId");

-- CreateIndex
CREATE INDEX "OrgFee_eventId_idx" ON "OrgFee"("eventId");

-- AddForeignKey
ALTER TABLE "OrgFee" ADD CONSTRAINT "OrgFee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OrgEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEvent" ADD CONSTRAINT "OrgEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEventResponse" ADD CONSTRAINT "OrgEventResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OrgEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEventResponse" ADD CONSTRAINT "OrgEventResponse_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrgMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

