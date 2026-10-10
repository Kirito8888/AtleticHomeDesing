-- v1.8: solo añade tablas y columnas opcionales (no toca datos).
-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "body" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PageUsage" (
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "week" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageUsage_pkey" PRIMARY KEY ("userId","path","week")
);

-- CreateTable
CREATE TABLE "ServerError" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageUsage_week_idx" ON "PageUsage"("week");

-- CreateIndex
CREATE UNIQUE INDEX "ServerError_key_key" ON "ServerError"("key");

-- CreateIndex
CREATE INDEX "ServerError_lastAt_idx" ON "ServerError"("lastAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_windowStart_idx" ON "RateLimitHit"("windowStart");

-- CreateIndex
CREATE INDEX "TrashItem_userId_deletedAt_idx" ON "TrashItem"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "PageUsage" ADD CONSTRAINT "PageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashItem" ADD CONSTRAINT "TrashItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

