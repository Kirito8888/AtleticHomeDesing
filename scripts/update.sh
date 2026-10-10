#!/usr/bin/env bash
# Actualiza LifeOS en el servidor con copia previa y vuelta atrás automática.
#
#   ./scripts/update.sh              # rama main
#   BRANCH=otra ./scripts/update.sh
#   ./scripts/update.sh --no-pull    # reconstruye el código actual (sin git pull)
#
# Pasos: copia de la BD → etiqueta la imagen actual como :previous → git pull →
# construye la imagen nueva (con la web vieja en marcha) → migraciones → cambia la web
# (limpiando contenedores sobrantes) → espera al healthcheck. Si no queda "healthy",
# vuelve al commit y a la imagen anteriores. Las migraciones son aditivas, así
# que la versión anterior funciona con la BD ya migrada.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
BRANCH="${BRANCH:-main}"
HEALTH_TIMEOUT="${UPDATE_HEALTH_TIMEOUT:-180}"
# Carpeta propia: ./backups la escribe como root el servicio "backup".
BACKUP_DIR="${UPDATE_BACKUP_DIR:-./backups-pre-update}"
PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

dc() { docker compose --env-file "$ENV_FILE" "$@"; }
log() { printf '\033[1m[update]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[update] %s\033[0m\n' "$*" >&2; exit 1; }
envval() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }

[ -f "$ENV_FILE" ] || die "No existe $ENV_FILE"
if [ "$PULL" = 1 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "Hay cambios locales en ficheros del repositorio (git status). Guárdalos o descártalos antes de actualizar."
fi

# Espera a que el contenedor web esté "healthy" (healthcheck de docker-compose.yml).
wait_healthy() {
  local svc="${1:-web}" id status waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    id="$(dc ps -q "$svc")"
    status="$( [ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    [ "$svc" = web ] && [ "${LIFEOS_SIMULATE_UNHEALTHY:-0}" = 1 ] && status=unhealthy # solo para probar la vuelta atrás
    case "$status" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# Contenedores del servicio web que no son el canónico (<proyecto>-web-1): restos de una
# recreación interrumpida (p. ej. «1a2b3c_lifeos-web-1»). Hacen fallar `up` con «Conflict».
clean_web() {
  local project canonical id name
  project="$(docker compose --env-file "$ENV_FILE" config --format json 2>/dev/null | sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -1)"
  project="${project:-${COMPOSE_PROJECT_NAME:-lifeos}}"
  canonical="${project}-web-1"
  for id in $(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=web"); do
    name="$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')"
    if [ "$name" != "$canonical" ]; then
      log "Quito un contenedor web sobrante: $name"
      docker rm -f "$id" >/dev/null || true
    fi
  done
}

# Arranca la web con la imagen ya construida. Si choca el nombre, limpia y reintenta una vez.
up_web() {
  clean_web
  if ! dc up -d --no-build --force-recreate web; then
    log "El arranque falló; limpio contenedores web y lo reintento una vez…"
    dc rm -sf web >/dev/null 2>&1 || true
    clean_web
    dc up -d --no-build --force-recreate web
  fi
}

PREV_COMMIT="$(git rev-parse HEAD)"
STAMP="$(date +%F_%H%M)"

# 1. Copia de la BD (cifrada si hay clave pública y age instalado)
mkdir -p "$BACKUP_DIR"
RECIPIENT="${BACKUP_AGE_RECIPIENT:-$(envval BACKUP_AGE_RECIPIENT)}"
PGUSER_="$(envval POSTGRES_USER)"; PGDB_="$(envval POSTGRES_DB)"
if [ -n "$RECIPIENT" ] && command -v age >/dev/null; then
  OUT="$BACKUP_DIR/pre-update-$STAMP.dump.age"
  dc exec -T db pg_dump -U "${PGUSER_:-lifeos}" -d "${PGDB_:-lifeos}" -Fc | age -r "$RECIPIENT" > "$OUT"
else
  OUT="$BACKUP_DIR/pre-update-$STAMP.dump"
  (umask 077; dc exec -T db pg_dump -U "${PGUSER_:-lifeos}" -d "${PGDB_:-lifeos}" -Fc > "$OUT")
  log "AVISO: copia SIN cifrar (define BACKUP_AGE_RECIPIENT e instala age). Bórrala cuando ya no la necesites."
fi
[ -s "$OUT" ] || die "La copia previa está vacía: no continúo"
log "Copia previa: $OUT"

# 2. Imagen actual → :previous
if docker image inspect lifeos-web:latest >/dev/null 2>&1; then
  docker image tag lifeos-web:latest lifeos-web:previous
  HAVE_PREVIOUS=1
else
  HAVE_PREVIOUS=0
fi

# 3. Código nuevo
if [ "$PULL" = 1 ]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
log "Versión: $(git log --oneline -1)"

rollback() {
  log "Volviendo a la versión anterior ($PREV_COMMIT)…"
  [ "$PULL" = 1 ] && git checkout -q "$PREV_COMMIT"
  if [ "$HAVE_PREVIOUS" = 1 ]; then
    docker image tag lifeos-web:previous lifeos-web:latest
    up_web || true
    if LIFEOS_SIMULATE_UNHEALTHY=0 wait_healthy; then
      log "Vuelta atrás completada: la versión anterior está en marcha."
    else
      log "La versión anterior tampoco arranca: revisa 'dc logs web'. Copia previa: $OUT"
    fi
  fi
  die "Actualización fallida. Revisa: docker compose --env-file $ENV_FILE logs --tail=100 web"
}

# 4. Imagen nueva ANTES de tocar nada: mientras se construye (varios minutos) la web
#    actual sigue sirviendo, y si el build falla no se ha parado nada.
# v1.8 · el commit queda dentro de la imagen (Estado del servidor avisa si hay uno más nuevo)
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
export GIT_SHA
log "Construyendo la imagen nueva (la web actual sigue funcionando)…"
if ! dc build web; then
  [ "$PULL" = 1 ] && git checkout -q "$PREV_COMMIT"
  die "El build falló: no se ha cambiado nada (la versión anterior sigue en marcha)."
fi

# 4b. Base de datos: si cambió su configuración (imagen fijada, memoria, ajustes de Postgres), Compose
#     la recrea con los mismos datos (volumen); si no cambió, no la toca. Si no vuelve sana, se
#     restaura la configuración anterior antes de seguir.
log "Aplicando la configuración de la base de datos (si cambió, se reinicia unos segundos)…"
if ! { dc up -d --no-build db && wait_healthy db; }; then
  [ "$PULL" = 1 ] && git checkout -q "$PREV_COMMIT"
  dc up -d --no-build db || true
  wait_healthy db || true
  die "La base de datos no arrancó con la configuración nueva: se ha vuelto a la anterior (revisa 'dc logs db')."
fi

# 5. Migraciones (aditivas) y 6. web nueva (solo se para la vieja aquí, unos segundos)
dc --profile tools run --rm --build migrate || rollback
up_web || rollback

# 7. Healthcheck
log "Esperando al healthcheck (máx. ${HEALTH_TIMEOUT}s)…"
wait_healthy || rollback

# 8. Copias: si el servicio de copias está en marcha, se reconstruye con la versión nueva
if dc --profile backup ps --services --status running 2>/dev/null | grep -qx backup; then
  log "Actualizando el servicio de copias…"
  dc --profile backup up -d --build backup || log "Aviso: no se pudo actualizar el servicio de copias (la web ya está actualizada)."
fi

docker image prune -f >/dev/null || true
log "Actualizado correctamente a $(git log --oneline -1)"
