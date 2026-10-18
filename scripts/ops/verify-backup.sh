#!/usr/bin/env bash
# Comprueba una copia de Atlenza SIN tocar la base de datos activa.
# Siempre: suma sha256, integridad gzip y contenido (cabecera/pie de pg_dump, tablas, _prisma_migrations, "User").
# Con --restore-test: además la restaura en una BD TEMPORAL dentro del contenedor y la borra al terminar.
#
# Uso:   bash scripts/ops/verify-backup.sh [--dry-run] [--restore-test] [fichero]
#        (sin fichero: la copia más reciente de BACKUP_DIR)
# Variables: BACKUP_CONTAINER (lifeos-db-1) · BACKUP_DIR (/var/backups/lifeos)
#            BACKUP_AGE_IDENTITY  fichero con la clave PRIVADA age, solo para copias .age (se lee, no se imprime)
# Códigos de salida: 0 = copia válida; distinto de 0 = algo falla.
set -euo pipefail
umask 077

CONTAINER="${BACKUP_CONTAINER:-lifeos-db-1}"
DIR="${BACKUP_DIR:-/var/backups/lifeos}"
DRY=0; RESTORE=0; FILE=""

log() { printf '[verify] %s\n' "$*"; }
die() { printf '[verify] FALLO: %s\n' "$*" >&2; exit 1; }

for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --dry-run) DRY=1 ;;
    --restore-test) RESTORE=1 ;;
    -*) die "opción desconocida: $a (usa --help)" ;;
    *) FILE="$a" ;;
  esac
done

if [ -z "$FILE" ]; then
  FILE="$(find "$DIR" -maxdepth 1 -type f -name 'lifeos-db-*.sql.gz*' ! -name '*.sha256' 2>/dev/null | sort | tail -n 1 || true)"
  if [ -z "$FILE" ]; then
    [ "$DRY" = 1 ] || die "no hay copias en $DIR"
    FILE="$DIR/lifeos-db-<última>.sql.gz"
  fi
fi

if [ "$DRY" = 1 ]; then
  log "SIMULACIÓN sobre: $FILE"
  log "1) sha256sum -c  2) gzip -t  3) cabecera/pie/tablas/_prisma_migrations/\"User\""
  [ "$RESTORE" = 1 ] && log "4) restauración en una BD temporal de $CONTAINER (se borra al acabar)"
  exit 0
fi

[ -f "$FILE" ] || die "no existe $FILE"
command -v sha256sum >/dev/null 2>&1 || die "falta sha256sum"

# 1) suma de control
if [ -f "$FILE.sha256" ]; then
  ( cd "$(dirname "$FILE")" && sha256sum -c --status "$(basename "$FILE").sha256" ) || die "la suma sha256 NO coincide (copia dañada o manipulada)"
  log "sha256 OK"
else
  die "falta $FILE.sha256"
fi

# Flujo SQL en claro (se descifra al vuelo si es .age; nada se escribe en disco)
stream() {
  case "$FILE" in
    *.age)
      command -v age >/dev/null 2>&1 || die "falta el binario age"
      [ -n "${BACKUP_AGE_IDENTITY:-}" ] && [ -r "${BACKUP_AGE_IDENTITY}" ] || die "copia cifrada: define BACKUP_AGE_IDENTITY con la ruta de la clave privada"
      age -d -i "$BACKUP_AGE_IDENTITY" "$FILE" | gzip -dc ;;
    *) gzip -dc "$FILE" ;;
  esac
}

# 2) integridad gzip + 3) contenido
stream > /dev/null || die "gzip/age no pueden leer la copia"
log "descompresión OK"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
stream > "$TMP"
grep -q 'PostgreSQL database dump$' "$TMP" || die "no parece un volcado de pg_dump (falta cabecera)"
grep -q 'PostgreSQL database dump complete' "$TMP" || die "volcado truncado (falta el pie «dump complete»)"
TABLES="$(grep -c '^CREATE TABLE ' "$TMP" || true)"
[ "$TABLES" -gt 0 ] || die "el volcado no contiene tablas"
grep -q '^CREATE TABLE public\._prisma_migrations' "$TMP" || die "falta _prisma_migrations"
grep -q '^CREATE TABLE public\."User"' "$TMP" || die "falta la tabla \"User\""
log "contenido OK: $TABLES tablas"

# 4) restauración de prueba en BD temporal (nunca la activa)
if [ "$RESTORE" = 1 ]; then
  command -v docker >/dev/null 2>&1 || die "docker no está disponible"
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = "true" ] || die "el contenedor $CONTAINER no está en marcha"
  TMPDB="lifeos_verify_$(date -u +%Y%m%d%H%M%S)"
  LIVE="$(docker exec "$CONTAINER" sh -c 'printf %s "$POSTGRES_DB"')"
  [ "$TMPDB" != "$LIVE" ] || die "el nombre temporal coincide con la BD activa"
  cleanup() { docker exec "$CONTAINER" sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $TMPDB" >/dev/null 2>&1 || true; rm -f "$TMP"; }
  trap cleanup EXIT
  docker exec "$CONTAINER" sh -c "createdb -U \"\$POSTGRES_USER\" $TMPDB" || die "no se pudo crear la BD temporal"
  docker exec -i "$CONTAINER" sh -c "psql -q -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d $TMPDB" < "$TMP" >/dev/null || die "la restauración de prueba falló"
  N="$(docker exec "$CONTAINER" sh -c "psql -tA -U \"\$POSTGRES_USER\" -d $TMPDB -c \"select count(*) from information_schema.tables where table_schema='public'\"")"
  log "restauración de prueba OK: $N tablas en $TMPDB (se borra ahora)"
fi
log "copia VÁLIDA: $FILE"
