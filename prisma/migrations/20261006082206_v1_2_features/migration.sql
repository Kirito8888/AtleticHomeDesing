-- LifeOS v1.2: migración aditiva (solo crea tipos, columnas, tablas e índices; no borra ni modifica datos).

-- ===== Seguridad: 2FA, auditoría, permisos del coach =====
-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'EMAIL_CHANGED', 'SESSIONS_REVOKED', 'TOTP_ENABLED', 'TOTP_DISABLED', 'RECOVERY_CODE_USED', 'DATA_EXPORTED', 'AI_CONSENT_CHANGED', 'COACH_SCOPES_CHANGED');

-- CreateEnum
CREATE TYPE "CoachScope" AS ENUM ('LOAD', 'SESSIONS', 'RECOVERY', 'PLANNING', 'REPORTS');

-- AlterTable
ALTER TABLE "CoachAthlete" ADD COLUMN     "scopes" "CoachScope"[] DEFAULT ARRAY['LOAD', 'SESSIONS', 'RECOVERY', 'PLANNING', 'REPORTS']::"CoachScope"[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Uso diario: plantillas, comidas favoritas, lesiones =====
-- CreateEnum
CREATE TYPE "BodyArea" AS ENUM ('HEAD_NECK', 'SHOULDER', 'ELBOW', 'WRIST_HAND', 'CHEST', 'UPPER_BACK', 'LOWER_BACK', 'ABDOMEN', 'HIP_GROIN', 'GLUTE', 'HAMSTRING', 'QUADRICEPS', 'KNEE', 'CALF', 'ACHILLES', 'ANKLE', 'FOOT', 'OTHER');

-- CreateEnum
CREATE TYPE "BodySide" AS ENUM ('LEFT', 'RIGHT', 'BOTH');

-- CreateTable
CREATE TABLE "SessionTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealType" "MealType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "foodProductId" TEXT,
    "customName" TEXT,
    "quantityG" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "fiberG" DOUBLE PRECISION,

    CONSTRAINT "MealTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Injury" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" "BodyArea" NOT NULL,
    "side" "BodySide",
    "pain" INTEGER NOT NULL,
    "limitsTraining" BOOLEAN NOT NULL DEFAULT false,
    "startedOn" DATE NOT NULL,
    "resolvedOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Injury_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionTemplate_userId_name_key" ON "SessionTemplate"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MealTemplate_userId_name_key" ON "MealTemplate"("userId", "name");

-- CreateIndex
CREATE INDEX "MealTemplateItem_templateId_idx" ON "MealTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "Injury_userId_startedOn_idx" ON "Injury"("userId", "startedOn");

-- AddForeignKey
ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTemplate" ADD CONSTRAINT "MealTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTemplateItem" ADD CONSTRAINT "MealTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MealTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTemplateItem" ADD CONSTRAINT "MealTemplateItem_foodProductId_fkey" FOREIGN KEY ("foodProductId") REFERENCES "FoodProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injury" ADD CONSTRAINT "Injury_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Notificaciones push e importación de extractos =====
-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "importHash" TEXT;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_key_key" ON "NotificationLog"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BankImportProfile_userId_name_key" ON "BankImportProfile"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_userId_importHash_key" ON "FinancialTransaction"("userId", "importHash");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportProfile" ADD CONSTRAINT "BankImportProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

