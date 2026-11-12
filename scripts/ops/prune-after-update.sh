#!/usr/bin/env bash
# Limpieza tras una actualización CORRECTA de Atlenza (la llama scripts/update.sh al final). Solo toca lo de Atlenza:
#   1. etiquetas «<WEB_IMAGE_REPO>:sha-*» y «<WEB_IMAGE_REPO>-migrate:sha-*» de commits que no son el actual ni el anterior;
#   2. las imágenes de web y migraciones que tenía el servidor antes de actualizar (OLD_IMAGE_IDS) y ya no usa nadie;
#   3. copias «pre-update-AAAA-MM-DD_HHMM.dump[.age]» antiguas (se conservan las UPDATE_KEEP_BACKUPS últimas, mínimo 1).
# No ejecuta `docker image prune` ni borra la caché de compilación: son globales y afectarían a otros proyectos del servidor.
# Nunca borra imágenes en uso ni lifeos-web:latest / :previous (la vuelta atrás). Las copias hechas a mano no se tocan.
#
# Uso:   bash scripts/ops/prune-after-update.sh [--dry-run] [-h|--help]
# Variables (las tres primeras las pasa update.sh): KEEP_SHAS, OLD_IMAGE_IDS, UPDATE_BACKUP_DIR (./backups-pre-update),
#   UPDATE_KEEP_BACKUPS (2), WEB_IMAGE_REPO y ENV_FILE (.env.production; de ahí se lee WEB_IMAGE_REPO si no está en el entorno)
# --dry-run: dice lo que haría sin borrar nada. Códigos de salida: 0 = hecho (también si no había nada que limpiar); 2 = opción desconocida.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${UPDATE_BACKUP_DIR:-./backups-pre-update}"
KEEP_BACKUPS="${UPDATE_KEEP_BACKUPS:-2}"
KEEP_SHAS="${KEEP_SHAS:-}"
OLD_IMAGE_IDS="${OLD_IMAGE_IDS:-}"
DRY=0

for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --dry-run) DRY=1 ;;
    *) echo "opción desconocida: $a (usa --help)" >&2; exit 2 ;;
  esac
done
case "$KEEP_BACKUPS" in ''|*[!0-9]*) KEEP_BACKUPS=2 ;; esac
[ "$KEEP_BACKUPS" -ge 1 ] || KEEP_BACKUPS=1
[ -n "$KEEP_SHAS" ] || KEEP_SHAS="$(git rev-parse HEAD 2>/dev/null || true)"

log() { printf '[limpieza] %s\n' "$*"; }
envval() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }

# ── Imágenes ────────────────────────────────────────────────────────────────
tags=0
imgs=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  repo="${WEB_IMAGE_REPO:-$(envval WEB_IMAGE_REPO)}"
  if [ -n "$repo" ] && [ -n "$KEEP_SHAS" ]; then
    while read -r ref; do
      [ -n "$ref" ] || continue
      sha="${ref##*:sha-}"
      keep=0
      for k in $KEEP_SHAS; do [ "$k" = "$sha" ] && keep=1; done
      [ "$keep" = 1 ] && continue
      if [ "$DRY" = 1 ]; then
        log "(simulación) quitaría la etiqueta $ref"; tags=$((tags + 1))
      elif docker rmi "$ref" >/dev/null 2>&1; then
        tags=$((tags + 1))
      fi
    done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | awk -v a="$repo:sha-" -v b="$repo-migrate:sha-" 'index($0, a) == 1 || index($0, b) == 1')
  fi

  # Imágenes que no se pueden tocar: la web y las migraciones actuales, la de vuelta atrás y las de cualquier contenedor.
  keep_ids="$(
    for r in lifeos-web:latest lifeos-web:previous lifeos-migrate:latest; do docker image inspect -f '{{.Id}}' "$r" 2>/dev/null; done
    docker ps -aq 2>/dev/null | xargs -r docker inspect -f '{{.Image}}' 2>/dev/null
  )"
  for id in $OLD_IMAGE_IDS; do
    docker image inspect "$id" >/dev/null 2>&1 || continue
    printf '%s\n' "$keep_ids" | grep -qxF "$id" && continue
    if [ "$DRY" = 1 ]; then
      log "(simulación) borraría la imagen anterior $id"; imgs=$((imgs + 1))
    elif docker rmi "$id" >/dev/null 2>&1; then
      imgs=$((imgs + 1))
    fi
  done
else
  log "Docker no responde: no limpio imágenes."
fi

# ── Copias previas a la actualización ───────────────────────────────────────
nb=0
bytes=0
if [ -d "$BACKUP_DIR" ]; then
  mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -printf '%f\n' | grep -E '^pre-update-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}\.dump(\.age)?$' | sort)
  total=${#files[@]}
  i=0
  while [ "$i" -lt $((total - KEEP_BACKUPS)) ]; do
    f="$BACKUP_DIR/${files[$i]}"
    size="$(stat -c %s "$f" 2>/dev/null || echo 0)"
    if [ "$DRY" = 1 ]; then
      log "(simulación) borraría la copia ${files[$i]}"; nb=$((nb + 1)); bytes=$((bytes + size))
    elif rm -f -- "$f"; then
      nb=$((nb + 1)); bytes=$((bytes + size))
    fi
    i=$((i + 1))
  done
fi

verb="Quitado"
[ "$DRY" = 1 ] && verb="(simulación) Quitaría"
log "$verb: $tags etiqueta(s) de imagen de CI, $imgs imagen(es) anterior(es) y $nb copia(s) previa(s) ($((bytes / 1048576)) MB)."
exit 0
