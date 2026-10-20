#!/usr/bin/env bash
# Copia de seguridad de la BD de Atlenza desde el host: pg_dump dentro del contenedor → gzip → (age) → sha256 → rotación.
# No detiene ni reinicia nada (pg_dump toma una instantánea consistente sin bloquear escrituras).
# Sin contraseñas: pg_dump usa las variables POSTGRES_* del propio contenedor; el host no las ve.
#
# Uso:   sh/bash scripts/ops/backup-lifeos.sh [--dry-run] [-h|--help]
# Variables opcionales:
#   BACKUP_CONTAINER      contenedor de Postgres (lifeos-db-1)
#   BACKUP_DIR            destino (/var/backups/lifeos; se crea con permisos 700)
#   BACKUP_KEEP_DAYS      días que se conservan (14)
#   BACKUP_AGE_RECIPIENT  clave PÚBLICA age1…: si está y hay `age`, la copia se cifra (.sql.gz.age). Muy recomendable:
#                         sin ella el volcado queda en claro (solo legible por el dueño, modo 600).
# Códigos de salida: 0 = copia hecha (o simulada); distinto de 0 = fallo, no se rota nada.
set -euo pipefail
umask 077

CONTAINER="${BACKUP_CONTAINER:-lifeos-db-1}"
DIR="${BACKUP_DIR:-/var/backups/lifeos}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
DRY=0

log() { printf '[backup %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
RECORD=0
# Anota la ejecución en BackupRun (la lee «Estado» y check-backups.sh). Mejor esfuerzo: nunca cambia el resultado de la copia.
# shellcheck disable=SC2016  # las variables POSTGRES_* se expanden DENTRO del contenedor, a propósito
record() {
  [ "$RECORD" = 1 ] || return 0
  local detail
  detail="$(printf '%s' "$2" | tr -d "'\\" | cut -c1-200)"
  printf "insert into \"BackupRun\" (id, ok, detail) values (md5(random()::text || clock_timestamp()::text), %s, '%s');\n" "$1" "$detail" \
    | docker exec -i "$CONTAINER" sh -c 'exec psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 || log "AVISO: no se pudo anotar la copia en BackupRun"
}
die() { log "FALLO: $*" >&2; record false "copia del host fallida: $*"; exit 1; }

for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --dry-run) DRY=1 ;;
    *) die "opción desconocida: $a (usa --help)" ;;
  esac
done
case "$KEEP" in ''|*[!0-9]*) die "BACKUP_KEEP_DAYS debe ser un número entero" ;; esac
case "$RECIPIENT" in ''|age1*) ;; *) die "BACKUP_AGE_RECIPIENT debe ser una clave pública age1… (nunca la privada)" ;; esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EXT="sql.gz"
if [ -n "$RECIPIENT" ]; then EXT="sql.gz.age"; fi
OUT="$DIR/lifeos-db-$STAMP.$EXT"

command -v docker >/dev/null 2>&1 || die "docker no está instalado o no está en el PATH"
command -v sha256sum >/dev/null 2>&1 || die "falta sha256sum"
command -v gzip >/dev/null 2>&1 || die "falta gzip"
if [ -n "$RECIPIENT" ]; then command -v age >/dev/null 2>&1 || die "BACKUP_AGE_RECIPIENT definido pero falta el binario age"; fi
[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = "true" ] \
  || die "el contenedor $CONTAINER no existe o no está en marcha"

if [ "$DRY" = 1 ]; then
  log "SIMULACIÓN (no se ejecuta pg_dump ni se borra nada)"
  log "contenedor: $CONTAINER · destino: $OUT (+ .sha256)"
  if [ -n "$RECIPIENT" ]; then log "cifrado: age (clave pública dada)"; else log "AVISO: sin BACKUP_AGE_RECIPIENT la copia queda sin cifrar (modo 600)"; fi
  if [ -d "$DIR" ]; then
    OLD="$(find "$DIR" -maxdepth 1 -type f -name 'lifeos-db-*' -mtime +"$KEEP" 2>/dev/null | wc -l | tr -d ' ')"
    log "se rotarían $OLD fichero(s) con más de $KEEP días (solo tras una copia correcta)"
  else
    log "$DIR no existe todavía: se crearía con permisos 700"
  fi
  exit 0
fi

RECORD=1
mkdir -p "$DIR"; chmod 700 "$DIR"
exec 9>"$DIR/.lock"
flock -n 9 || die "ya hay otra copia en curso"

PART="$OUT.partial"
trap 'rm -f "$PART"' EXIT

# shellcheck disable=SC2016  # las variables POSTGRES_* se expanden DENTRO del contenedor, a propósito
# El volcado sale por la salida estándar del contenedor; pipefail hace fallar el conjunto si pg_dump falla.
DUMP=(docker exec -i "$CONTAINER" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner')
if [ -n "$RECIPIENT" ]; then
  "${DUMP[@]}" | gzip -9 | age -r "$RECIPIENT" -o "$PART"
else
  log "AVISO: copia SIN cifrar (define BACKUP_AGE_RECIPIENT para cifrarla)"
  "${DUMP[@]}" | gzip -9 > "$PART"
fi
[ -s "$PART" ] || die "la copia salió vacía"
if [ -z "$RECIPIENT" ]; then gzip -t "$PART" || die "el gzip generado está dañado"; fi

mv "$PART" "$OUT"
( cd "$DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
chmod 600 "$OUT" "$OUT.sha256"
SIZE="$(wc -c < "$OUT" | tr -d ' ')"
log "ok: $OUT ($SIZE bytes) + .sha256"
record true "copia del host: $SIZE bytes${RECIPIENT:+, cifrada}"

# Rotación: solo tras una copia buena, solo nuestros ficheros y sin tocar la recién creada.
find "$DIR" -maxdepth 1 -type f -name 'lifeos-db-*' -mtime +"$KEEP" ! -name "$(basename "$OUT")*" -print -delete \
  | sed 's/^/[backup] rotada: /'
log "rotación hecha (se conservan $KEEP días)"
