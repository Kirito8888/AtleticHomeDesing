#!/usr/bin/env bash
# Localiza ficheros .env* y los deja en modo 600. No lee ni modifica su contenido y no cambia el dueño.
# Por defecto solo INFORMA (seco); cambia permisos únicamente con --apply. Ignora .env.example.
# No sigue enlaces simbólicos ni sale del sistema de ficheros de cada ruta; salta node_modules, .git y /var/lib/docker.
#
# Uso:   bash scripts/ops/secure-env-permissions.sh [--apply] [--dry-run] [ruta ...]
# Rutas por defecto (las que existan): /opt/lifeos /srv /etc/lifeos y $HOME
# AVISO: con 600 solo el dueño lo lee. Mira la columna «dueño»: quien lanza `docker compose --env-file` debe ser ese usuario.
# Código de salida: 0 siempre que el recorrido termine; 1 si algún chmod falla.
set -euo pipefail

APPLY=0; PATHS=()
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    -*) printf 'opción desconocida: %s (usa --help)\n' "$a" >&2; exit 2 ;;
    *) PATHS+=("$a") ;;
  esac
done
if [ "${#PATHS[@]}" -eq 0 ]; then
  for p in /opt/lifeos /srv /etc/lifeos "${HOME:-}"; do [ -n "$p" ] && [ -d "$p" ] && PATHS+=("$p"); done
fi
[ "${#PATHS[@]}" -gt 0 ] || { echo "No hay rutas que revisar."; exit 0; }

echo "Modo: $([ "$APPLY" = 1 ] && echo APLICAR || echo SECO, usa --apply para cambiar)"
SEEN=0; CHANGED=0; FAIL=0
while IFS= read -r -d '' f; do
  SEEN=$((SEEN + 1))
  MODE="$(stat -c '%a' "$f")"; OWNER="$(stat -c '%U:%G' "$f")"
  if [ "$MODE" = 600 ]; then printf 'ok      %s  600  %s\n' "$f" "$OWNER"; continue; fi
  if [ "$APPLY" = 1 ]; then
    if chmod 600 "$f"; then CHANGED=$((CHANGED + 1)); printf 'cambiado %s  %s → 600  %s\n' "$f" "$MODE" "$OWNER"
    else FAIL=1; printf 'ERROR   %s  no se pudo cambiar (%s)\n' "$f" "$OWNER" >&2; fi
  else
    printf 'cambiaría %s  %s → 600  %s\n' "$f" "$MODE" "$OWNER"
  fi
done < <(find -P "${PATHS[@]}" -xdev \
  \( -name node_modules -o -name .git -o -path /var/lib/docker -o -path /proc -o -path /sys \) -prune -o \
  -type f -name '.env*' ! -name '.env.example' -print0 2>/dev/null)
echo "Revisados: $SEEN · cambiados: $CHANGED"
[ "$FAIL" = 0 ]
