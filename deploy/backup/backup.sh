#!/bin/sh
# Copia cifrada de LifeOS: pg_dump → restauración de prueba → age → rotación.
# Variables: PGHOST PGUSER PGPASSWORD PGDATABASE (conexión), BACKUP_AGE_RECIPIENT
# (clave pública age1…), BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14),
# UPLOADS_DIR (/uploads, opcional).
# v1.7 · Regla 3-2-1: BACKUP_KEEP_MONTHS (12) conserva la copia del día 1 de cada mes;
# BACKUP_REMOTE (usuario@máquina:/ruta, opcional) envía las copias, ya cifradas, a otra máquina
# por rsync+SSH con la clave montada en /run/secrets/backup_ssh_key (manual § 8).
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

# Copia mensual (el día 1): se conserva BACKUP_KEEP_MONTHS meses aunque las diarias roten
if [ "$(date +%d)" = "01" ]; then
  cp "$DIR/db-$STAMP.dump.age" "$DIR/month-db-$STAMP.dump.age"
  [ -f "$DIR/uploads-$STAMP.tgz.age" ] && cp "$DIR/uploads-$STAMP.tgz.age" "$DIR/month-uploads-$STAMP.tgz.age"
fi
find "$DIR" -name '*.age' ! -name 'month-*' -type f -mtime +"$KEEP" -delete
find "$DIR" -name 'month-*.age' -type f -mtime +"$(( ${BACKUP_KEEP_MONTHS:-12} * 31 ))" -delete

# Fuera de este servidor (las copias ya van cifradas con age: la otra máquina no puede leerlas)
REMOTE_NOTE=""
if [ -n "${BACKUP_REMOTE:-}" ]; then
  KEY="${BACKUP_SSH_KEY:-/run/secrets/backup_ssh_key}"
  if rsync -a --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/backups/.known_hosts -o BatchMode=yes" "$DIR"/*.age "$BACKUP_REMOTE"/; then
    REMOTE_NOTE=", copiadas fuera"
  else
    REMOTE_NOTE=", FALLO al copiar fuera"
    log "AVISO: no se pudieron enviar las copias a $BACKUP_REMOTE"
  fi
fi
log "ok $STAMP: $TABLES_CHK tablas, $USERS_CHK usuarios, restauración verificada; copias en $DIR (se conservan $KEEP días)$REMOTE_NOTE"
# Para «Estado del servidor» en Ajustes (la web no ve la carpeta de copias). Si la
# tabla aún no existe (BD sin migrar a v1.5), no pasa nada.
psql -q -d "$PGDATABASE" -c "insert into \"BackupRun\" (id, ok, detail) values (md5(random()::text || clock_timestamp()::text), true, '$STAMP: $TABLES_CHK tablas, $USERS_CHK usuarios, restauración verificada$REMOTE_NOTE')" >/dev/null 2>&1 || true
