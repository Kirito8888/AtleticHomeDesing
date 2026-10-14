-- v2.1: primaryEvent + descripción y vídeo de ejercicio
-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "videoBytes" INTEGER,
ADD COLUMN     "videoMime" TEXT,
ADD COLUMN     "videoPath" TEXT;

