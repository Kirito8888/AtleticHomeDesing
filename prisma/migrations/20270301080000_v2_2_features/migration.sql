-- solo añade tablas y columnas
-- CreateTable
CREATE TABLE "WatchAlert" (
    "key" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchAlert_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ApiMetricMinute" (
    "replica" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "route" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER[],

    CONSTRAINT "ApiMetricMinute_pkey" PRIMARY KEY ("replica","minute","route")
);

-- CreateIndex
CREATE INDEX "ApiMetricMinute_minute_idx" ON "ApiMetricMinute"("minute");

