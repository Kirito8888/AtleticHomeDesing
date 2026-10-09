#!/bin/sh
# Copia cifrada de LifeOS: pg_dump → restauración de prueba → age → rotación.
# Variables: PGHOST PGUSER PGPASSWORD PGDATABASE (conexión), BACKUP_AGE_RECIPIENT
# (clave pública age1…), BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14),
# UPLOADS_DIR (/uploads, opcional).
set -eu
umask 077

: "${BACKUP_AGE_RECIPIENT:?Define BACKUP_AGE_RECIPIENT (clave pública age1..., ver manual § 8)}"
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
UPLOADS="${UPLOADS_DIR:-/uploads}"
STAMP="$(date +%F_%H%M)"
CHECK_DB="lifeos_restore_check_$$"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
  dropdb --if-exists "$CHECK_DB" 2>/dev/null || true
}
trap cleanup EXIT

log() { echo "[backup] $*"; }

mkdir -p "$DIR"
pg_dump -Fc -f "$TMP/db.dump"

# Restauración de prueba en una BD temporal: una copia que no se puede
# restaurar no es una copia. Se comparan tablas y migraciones aplicadas.
createdb "$CHECK_DB"
pg_restore --no-owner --exit-on-error -d "$CHECK_DB" "$TMP/db.dump"
count() { psql -d "$1" -tAc "$2"; }
TABLES_SRC="$(count "$PGDATABASE" "select count(*) from information_schema.tables where table_schema='public'")"
TABLES_CHK="$(count "$CHECK_DB" "select count(*) from information_schema.tables where table_schema='public'")"
MIG_SRC="$(count "$PGDATABASE" 'select count(*) from "_prisma_migrations"')"
MIG_CHK="$(count "$CHECK_DB" 'select count(*) from "_prisma_migrations"')"
USERS_CHK="$(count "$CHECK_DB" 'select count(*) from "User"')"
if [ "$TABLES_SRC" != "$TABLES_CHK" ] || [ "$MIG_SRC" != "$MIG_CHK" ]; then
  log "FALLO: la restauración de prueba no coincide (tablas $TABLES_SRC/$TABLES_CHK, migraciones $MIG_SRC/$MIG_CHK)"
  psql -q -d "$PGDATABASE" -c "insert into \"BackupRun\" (id, ok, detail) values (md5(random()::text || clock_timestamp()::text), false, 'restauración de prueba no coincide')" >/dev/null 2>&1 || true
  exit 1
fi

age -r "$BACKUP_AGE_RECIPIENT" -o "$DIR/db-$STAMP.dump.age" "$TMP/db.dump"
if [ -d "$UPLOADS" ]; then
  tar czf - -C "$UPLOADS" . | age -r "$BACKUP_AGE_RECIPIENT" -o "$DIR/uploads-$STAMP.tgz.age"
fi

find "$DIR" -name '*.age' -type f -mtime +"$KEEP" -delete
log "ok $STAMP: $TABLES_CHK tablas, $USERS_CHK usuarios, restauración verificada; copias en $DIR (se conservan $KEEP días)"
# Para «Estado del servidor» en Ajustes (la web no ve la carpeta de copias). Si la
# tabla aún no existe (BD sin migrar a v1.5), no pasa nada.
psql -q -d "$PGDATABASE" -c "insert into \"BackupRun\" (id, ok, detail) values (md5(random()::text || clock_timestamp()::text), true, '$STAMP: $TABLES_CHK tablas, $USERS_CHK usuarios, restauración verificada')" >/dev/null 2>&1 || true
