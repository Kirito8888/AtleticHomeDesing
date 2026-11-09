-- Composición corporal ISAK (cifrada)
-- CreateTable
CREATE TABLE "BodyComposition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyComposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyComposition_userId_date_idx" ON "BodyComposition"("userId", "date");

-- AddForeignKey
ALTER TABLE "BodyComposition" ADD CONSTRAINT "BodyComposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

