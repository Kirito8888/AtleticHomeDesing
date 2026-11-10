-- Composición corporal ISAK (cifrada) · índices O10, O11 y O13 (pg_trgm)
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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

-- CreateIndex
CREATE INDEX "FoodProduct_name_trgm_idx" ON "FoodProduct" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FoodProduct_brand_trgm_idx" ON "FoodProduct" USING GIN ("brand" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SessionComment_athleteId_idx" ON "SessionComment"("athleteId");

-- CreateIndex
CREATE INDEX "SessionComment_authorId_idx" ON "SessionComment"("authorId");

-- AddForeignKey
ALTER TABLE "BodyComposition" ADD CONSTRAINT "BodyComposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

