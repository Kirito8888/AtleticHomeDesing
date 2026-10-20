#!/usr/bin/env bash
# Avisa si las copias de seguridad no están funcionando: servicio sin activar, última copia fallida o demasiado vieja.
# Solo lectura: no escribe nada ni toca contenedores. Lo llama scripts/update.sh (que nunca revierte por su culpa).
#
# Uso:   bash scripts/ops/check-backups.sh [-h|--help]
# Variables opcionales:
#   BACKUP_CONTAINER   contenedor de Postgres (lifeos-db-1)
#   ENV_FILE           fichero de entorno de compose (.env.production)
#   BACKUP_MAX_AGE_H   horas sin copia buena a partir de las cuales se avisa (36, igual que «Estado»)
# «Activo» = el servicio `backup` del compose en marcha, o una línea de cron con backup-lifeos (crontab del usuario o /etc/cron.d).
# La última copia sale de la tabla BackupRun, que escriben el servicio de copias y backup-lifeos.sh.
# Códigos de salida: 0 = copias al día; 1 = hay un aviso (se explica en la salida).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

CONTAINER="${BACKUP_CONTAINER:-lifeos-db-1}"
ENV_FILE="${ENV_FILE:-.env.production}"
MAX_H="${BACKUP_MAX_AGE_H:-36}"

for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opción desconocida: $a (usa --help)" >&2; exit 2 ;;
  esac
done

warn=0
say_warn() { printf '⚠️  %s\n' "$*"; warn=1; }

active=0
if docker compose --env-file "$ENV_FILE" --profile backup ps --services --status running 2>/dev/null | grep -qx backup; then active=1; fi
if { crontab -l 2>/dev/null; cat /etc/cron.d/* 2>/dev/null; } | grep -v '^[[:space:]]*#' | grep -q 'backup-lifeos'; then active=1; fi

# shellcheck disable=SC2016  # las variables POSTGRES_* se expanden DENTRO del contenedor, a propósito
ROW="$(printf '%s\n' 'select coalesce(extract(epoch from max(at) filter (where ok))::bigint, 0), coalesce(extract(epoch from max(at))::bigint, 0), coalesce((select ok::text from "BackupRun" order by at desc limit 1), '"''"') from "BackupRun";' \
  | docker exec -i "$CONTAINER" sh -c 'exec psql -qtA -F " " -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null)" || ROW=""

if [ -z "$ROW" ]; then
  say_warn "No se pudo leer el registro de copias (¿está en marcha el contenedor $CONTAINER?)."
  [ "$active" = 1 ] || say_warn "Tampoco se detecta el servicio de copias (compose --profile backup) ni una tarea de cron con backup-lifeos."
  exit "$warn"
fi

read -r last_ok last last_flag <<<"$ROW"
now="$(date +%s)"

if [ "${last:-0}" = 0 ]; then
  say_warn "No consta ninguna copia de seguridad."
  if [ "$active" = 1 ]; then
    say_warn "El servicio parece activo, pero aún no ha registrado ninguna: revisa sus registros."
  else
    say_warn "El servicio de copias no está activo: docker compose --profile backup up -d --build backup (o programa backup-lifeos.sh en cron)."
  fi
  exit 1
fi

[ "$active" = 1 ] || say_warn "No se detecta el servicio de copias ni una tarea de cron (si corre con otro usuario, ignora este aviso)."
[ "$last_flag" = true ] || say_warn "La última copia falló: revisa el servicio de copias o la salida de backup-lifeos.sh."
if [ "${last_ok:-0}" = 0 ] || [ $(( (now - last_ok) / 3600 )) -ge "$MAX_H" ]; then
  say_warn "No hay copia buena desde hace más de $MAX_H horas."
fi

if [ "$warn" = 0 ]; then printf '✅ Copias al día (última buena hace %s h).\n' $(( (now - last_ok) / 3600 )); fi
exit "$warn"
