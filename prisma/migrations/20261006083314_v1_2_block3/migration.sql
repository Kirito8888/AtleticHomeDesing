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
