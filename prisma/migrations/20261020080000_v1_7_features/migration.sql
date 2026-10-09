-- v1.7: solo añade tablas y columnas opcionales (no toca datos).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventType" ADD VALUE 'PASSKEY_ADDED';
ALTER TYPE "SecurityEventType" ADD VALUE 'PASSKEY_REMOVED';
ALTER TYPE "SecurityEventType" ADD VALUE 'PASSKEY_LOGIN';
ALTER TYPE "SecurityEventType" ADD VALUE 'SHARE_LINK_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE 'DATA_RESTORED';
ALTER TYPE "SecurityEventType" ADD VALUE 'CONSENT_CHANGED';
ALTER TYPE "SecurityEventType" ADD VALUE 'PRIVACY_REQUEST';

-- AlterTable
ALTER TABLE "SecurityEvent" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prevHash" TEXT;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "processingRestrictedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "name" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "right" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mesoCode" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "profile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Consent_userId_purpose_createdAt_idx" ON "Consent"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineProfile_userId_createdAt_idx" ON "RoutineProfile"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineTest_routineId_metric_date_idx" ON "RoutineTest"("routineId", "metric", "date");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineProfile" ADD CONSTRAINT "RoutineProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineTest" ADD CONSTRAINT "RoutineTest_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "RoutineProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

