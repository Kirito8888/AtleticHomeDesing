-- v1.5: registro de copias de seguridad (lo escribe el servicio "backup" con psql).
-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "detail" TEXT,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_at_idx" ON "BackupRun"("at");

