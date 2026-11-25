-- solo añade tablas y columnas (Suite de entrenadora: fichas gestionadas)
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managedById" TEXT;

-- CreateTable
CREATE TABLE "ManagedAthlete" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "birthYear" INTEGER,
    "category" TEXT,
    "discipline" TEXT,
    "group" TEXT,
    "notes" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedAthlete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagedAthlete_userId_key" ON "ManagedAthlete"("userId");

-- CreateIndex
CREATE INDEX "ManagedAthlete_coachId_archivedAt_idx" ON "ManagedAthlete"("coachId", "archivedAt");

-- CreateIndex
CREATE INDEX "User_managedById_idx" ON "User"("managedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedAthlete" ADD CONSTRAINT "ManagedAthlete_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedAthlete" ADD CONSTRAINT "ManagedAthlete_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

