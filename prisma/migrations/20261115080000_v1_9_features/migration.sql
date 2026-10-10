-- v1.9: solo añade tablas y columnas opcionales (no toca datos).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventType" ADD VALUE 'AI_PROVIDER_CHANGED';
ALTER TYPE "SecurityEventType" ADD VALUE 'INVITATION_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE 'ACCOUNT_SUSPENDED';
ALTER TYPE "SecurityEventType" ADD VALUE 'ACCOUNT_REACTIVATED';
ALTER TYPE "SecurityEventType" ADD VALUE 'PASSWORD_RESET_ISSUED';
ALTER TYPE "SecurityEventType" ADD VALUE 'PASSWORD_RESET_USED';
ALTER TYPE "SecurityEventType" ADD VALUE 'TERMS_ACCEPTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ATHLETE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "keySealed" TEXT,
    "keyHint" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiCredential_userId_key" ON "AiCredential"("userId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCredential" ADD CONSTRAINT "AiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- v1.9 · Un solo ejercicio global (userId NULL) por nombre. @@unique([userId, name]) no lo impedía
-- porque en PostgreSQL NULL ≠ NULL. Si hubiera duplicados (p. ej. dos seeds a la vez), sus series,
-- marcas y alias pasan al más antiguo y se borran los demás. Índice parcial: Prisma no lo modela
-- (como el HNSW de DocumentChunk); está documentado en schema.prisma.
CREATE TEMP TABLE "_exercise_dups" AS
  SELECT id, keep FROM (
    SELECT id, first_value(id) OVER (PARTITION BY name ORDER BY "createdAt", id) AS keep
    FROM "Exercise" WHERE "userId" IS NULL
  ) r WHERE id <> keep;
UPDATE "StrengthSet" t SET "exerciseId" = d.keep FROM "_exercise_dups" d WHERE t."exerciseId" = d.id;
UPDATE "PersonalRecord" t SET "exerciseId" = d.keep FROM "_exercise_dups" d WHERE t."exerciseId" = d.id;
UPDATE "ExerciseAlias" t SET "exerciseId" = d.keep FROM "_exercise_dups" d WHERE t."exerciseId" = d.id;
DELETE FROM "Exercise" e USING "_exercise_dups" d WHERE e.id = d.id;
CREATE UNIQUE INDEX IF NOT EXISTS "Exercise_global_name_key" ON "Exercise"("name") WHERE "userId" IS NULL;
DROP TABLE "_exercise_dups";
