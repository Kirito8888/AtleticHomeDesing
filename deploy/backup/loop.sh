#!/bin/sh
# Ejecuta backup.sh cada día a BACKUP_TIME (HH:MM, hora local de TZ; por defecto 03:30).
# BACKUP_ON_START=true hace además una copia nada más arrancar (útil para comprobar).
set -eu
TIME="${BACKUP_TIME:-03:30}"

# "08" → 8 (sin depender de date -d, que BusyBox interpreta distinto)
num() { n="$(echo "$1" | sed 's/^0*//')"; echo "${n:-0}"; }
seconds_until() {
  h="$(num "${TIME%%:*}")"; m="$(num "${TIME##*:}")"
  now=$(( $(num "$(date +%H)") * 3600 + $(num "$(date +%M)") * 60 + $(num "$(date +%S)") ))
  target=$(( h * 3600 + m * 60 ))
  [ "$target" -le "$now" ] && target=$(( target + 86400 ))
  echo $(( target - now ))
}

[ "${BACKUP_ON_START:-false}" = "true" ] && { /usr/local/bin/backup.sh || echo "[backup] FALLO en la copia inicial"; }

while true; do
  wait_s="$(seconds_until)"
  echo "[backup] próxima copia a las $TIME (en $((wait_s / 60)) min)"
  sleep "$wait_s"
  /usr/local/bin/backup.sh || echo "[backup] FALLO: revisa los mensajes anteriores"
done
