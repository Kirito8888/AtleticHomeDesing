-- solo añade tablas y columnas
-- CreateTable
CREATE TABLE "FvSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bodyMassKg" DOUBLE PRECISION NOT NULL,
    "hpoCm" DOUBLE PRECISION NOT NULL,
    "loads" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FvSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FvSeries_userId_date_idx" ON "FvSeries"("userId", "date");

-- AddForeignKey
ALTER TABLE "FvSeries" ADD CONSTRAINT "FvSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

