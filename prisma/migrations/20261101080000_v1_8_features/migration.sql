-- v1.8: solo añade tablas y columnas opcionales (no toca datos).
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

-- CreateIndex
CREATE INDEX "PageUsage_week_idx" ON "PageUsage"("week");

-- CreateIndex
CREATE UNIQUE INDEX "ServerError_key_key" ON "ServerError"("key");

-- CreateIndex
CREATE INDEX "ServerError_lastAt_idx" ON "ServerError"("lastAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_windowStart_idx" ON "RateLimitHit"("windowStart");

-- AddForeignKey
ALTER TABLE "PageUsage" ADD CONSTRAINT "PageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

