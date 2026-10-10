-- v1.10: solo añade tablas y columnas opcionales (no toca datos).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventType" ADD VALUE 'TELEGRAM_LINKED';
ALTER TYPE "SecurityEventType" ADD VALUE 'TELEGRAM_UNLINKED';

-- AlterTable
ALTER TABLE "FoodProduct" ADD COLUMN     "b12Per100g" DOUBLE PRECISION,
ADD COLUMN     "calciumPer100g" DOUBLE PRECISION,
ADD COLUMN     "magnesiumPer100g" DOUBLE PRECISION,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "potassiumPer100g" DOUBLE PRECISION,
ADD COLUMN     "sodiumPer100g" DOUBLE PRECISION,
ADD COLUMN     "syncedAt" TIMESTAMP(3),
ADD COLUMN     "vitDPer100g" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Macros" ADD COLUMN     "b12Ug" DOUBLE PRECISION,
ADD COLUMN     "calciumMg" DOUBLE PRECISION,
ADD COLUMN     "magnesiumMg" DOUBLE PRECISION,
ADD COLUMN     "potassiumMg" DOUBLE PRECISION,
ADD COLUMN     "sodiumMg" DOUBLE PRECISION,
ADD COLUMN     "vitDUg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "TelegramLink" (
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TelegramLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSyncState" (
    "brand" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER,
    "products" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSyncState_pkey" PRIMARY KEY ("brand")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkCode_codeHash_key" ON "TelegramLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramLinkCode_userId_idx" ON "TelegramLinkCode"("userId");

-- CreateIndex
CREATE INDEX "FoodProduct_ownerId_idx" ON "FoodProduct"("ownerId");

-- AddForeignKey
ALTER TABLE "FoodProduct" ADD CONSTRAINT "FoodProduct_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkCode" ADD CONSTRAINT "TelegramLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

