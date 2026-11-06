#!/usr/bin/env bash
# Comprobación única y de SOLO LECTURA del Hito 0 (validar v2.6 en el servidor real): Chromium/PDF, migración v2_6_study_pack, IA y copias.
# No escribe nada, no reinicia nada. Un servicio apagado se marca [DEGRADADO / APAGADO] y la ejecución sigue.
#
# Uso:   bash scripts/ops/verify-hito-0.sh [--no-color] [-h|--help]
# Variables opcionales:
#   ENV_FILE           fichero de entorno (.env.production); solo se LEEN LOCAL_AI_BASE_URL, LOCAL_AI_ONLY y LOCAL_AI_MODEL, sin ejecutarlo
#   DB_CONTAINER       contenedor de Postgres (lifeos-db-1)
#   WEB_CONTAINER      contenedor de la web (lifeos-web-1)
#   DATABASE_URL       si existe y hay psql, se usa en vez de docker exec
#   CHROMIUM_PATH      binario de Chromium en esta máquina (en el contenedor web se usa el suyo)
#   LOCAL_AI_BASE_URL  IA local (se consulta <origen>/health)
#   VERIFY_TIMEOUT_S   segundos máximos por consulta de red (3)
# Estados: OK (verde) · AVISO / DEGRADADO (amarillo) · ERROR (rojo).
# Códigos de salida: 0 = sin fallos críticos (avisos y servicios apagados no cuentan); 1 = hay algún ERROR.
# Ojo: no sustituye la prueba con sesión de S5 (que el manual PDF responda 200) ni la de S4 (paquete con IA real).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

ENV_FILE="${ENV_FILE:-.env.production}"
DB_CONTAINER="${DB_CONTAINER:-lifeos-db-1}"
WEB_CONTAINER="${WEB_CONTAINER:-lifeos-web-1}"
TMO="${VERIFY_TIMEOUT_S:-3}"
MIGRATION="20270602080000_v2_6_study_pack"

color=1
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --no-color) color=0 ;;
    *) echo "opción desconocida: $a (usa --help)" >&2; exit 2 ;;
  esac
done
{ [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; } || color=0

if [ "$color" = 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; Z=$'\033[0m'; else G=""; Y=""; R=""; Z=""; fi
n_ok=0; n_warn=0; n_err=0
ok()   { printf '%s[OK]%s %s\n' "$G" "$Z" "$*"; n_ok=$((n_ok + 1)); }
aviso() { printf '%s[AVISO]%s %s\n' "$Y" "$Z" "$*"; n_warn=$((n_warn + 1)); }
apag() { printf '%s[DEGRADADO / APAGADO]%s %s\n' "$Y" "$Z" "$*"; n_warn=$((n_warn + 1)); }
fallo() { printf '%s[ERROR]%s %s\n' "$R" "$Z" "$*"; n_err=$((n_err + 1)); }
titulo() { printf '\n== %s ==\n' "$*"; }

# Lee una clave de ENV_FILE sin ejecutarlo (primera coincidencia, sin comillas).
from_env_file() {
  [ -r "$ENV_FILE" ] || return 0
  grep -m1 -E "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}
LOCAL_AI_BASE_URL="${LOCAL_AI_BASE_URL:-$(from_env_file LOCAL_AI_BASE_URL)}"
LOCAL_AI_ONLY="${LOCAL_AI_ONLY:-$(from_env_file LOCAL_AI_ONLY)}"
LOCAL_AI_MODEL="${LOCAL_AI_MODEL:-$(from_env_file LOCAL_AI_MODEL)}"

have() { command -v "$1" >/dev/null 2>&1; }
web_up() { have docker && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$WEB_CONTAINER"; }

# Ejecuta SQL de solo lectura (stdin). Devuelve distinto de 0 si no hay acceso a la BD.
# shellcheck disable=SC2016  # POSTGRES_* se expanden DENTRO del contenedor, a propósito
sql() {
  if [ -n "${DATABASE_URL:-}" ] && have psql; then
    # Prisma añade ?schema=..., que psql no acepta: se quita.
    psql -qtA -v ON_ERROR_STOP=1 "$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')" 2>/dev/null
  elif have docker; then
    docker exec -i "$DB_CONTAINER" sh -c 'exec psql -qtA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null
  else
    return 1
  fi
}

# ── 1. Chromium / PDF (S5) ──
titulo "1. Chromium y render PDF"
if web_up; then
  # shellcheck disable=SC2016  # se evalúa dentro del contenedor
  if docker exec "$WEB_CONTAINER" sh -c '[ -x "${CHROMIUM_PATH:-/usr/bin/chromium}" ]' >/dev/null 2>&1; then
    ok "Chromium presente en el contenedor $WEB_CONTAINER."
  else
    fallo "El contenedor $WEB_CONTAINER no tiene Chromium ejecutable: reconstruye la imagen (S5)."
  fi
elif [ -n "${CHROMIUM_PATH:-}" ]; then
  if [ -x "$CHROMIUM_PATH" ]; then ok "CHROMIUM_PATH apunta a un binario ejecutable."; else fallo "CHROMIUM_PATH está definida pero no es ejecutable."; fi
else
  apag "No hay contenedor web en marcha ni CHROMIUM_PATH: no se puede comprobar el binario."
fi
echo "     Pendiente a mano: con sesión, generar un manual PDF y ver 200 (no 503)."

# ── 2. Base de datos (S9) ──
titulo "2. Base de datos y migración $MIGRATION"
tablas="$(printf '%s\n' "select to_regclass('public.\"StudyTopicPack\"') is not null, to_regclass('public.\"QuestProgress\"') is not null;" | sql)" || tablas=""
if [ -z "$tablas" ]; then
  apag "Sin acceso a la base de datos (¿contenedor $DB_CONTAINER parado, sin DATABASE_URL/psql o sin docker?)."
else
  case "$tablas" in
    "t|t") ok "Tablas StudyTopicPack y QuestProgress presentes." ;;
    *) fallo "Faltan tablas de v2_6_study_pack (StudyTopicPack|QuestProgress = $tablas): aplica la migración." ;;
  esac
  aplicadas="$(printf '%s\n' "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null;" | sql)" || aplicadas=""
  if [ -z "$aplicadas" ]; then
    fallo "No se pudo leer _prisma_migrations."
  else
    if printf '%s\n' "$aplicadas" | grep -qx "$MIGRATION"; then ok "Migración $MIGRATION aplicada."; else fallo "Migración $MIGRATION sin aplicar."; fi
    pendientes=""
    for d in prisma/migrations/*/; do
      m="$(basename "$d")"
      [ -f "$d/migration.sql" ] || continue
      printf '%s\n' "$aplicadas" | grep -qx "$m" || pendientes="$pendientes $m"
    done
    if [ -z "$pendientes" ]; then ok "Todas las migraciones del repositorio están aplicadas."; else fallo "Migraciones sin aplicar:$pendientes"; fi
  fi
fi

# ── 3. IA ──
titulo "3. IA"
if [ -n "${GEMINI_API_KEY:-}" ] || [ -n "$(from_env_file GEMINI_API_KEY)" ]; then echo "     GEMINI_API_KEY: definida"; else echo "     GEMINI_API_KEY: no definida"; fi
echo "     LOCAL_AI_ONLY: ${LOCAL_AI_ONLY:-no definida} · LOCAL_AI_MODEL: ${LOCAL_AI_MODEL:-no definida}"
if [ -z "$LOCAL_AI_BASE_URL" ]; then
  aviso "LOCAL_AI_BASE_URL no definida: no hay IA local configurada."
elif ! have curl; then
  apag "LOCAL_AI_BASE_URL definida, pero falta curl para consultar /health."
else
  origen="$(printf '%s' "$LOCAL_AI_BASE_URL" | sed -E 's#^([a-zA-Z]+://[^/]+).*#\1#')"
  if curl -fsS -m "$TMO" -o /dev/null "$origen/health" 2>/dev/null; then
    ok "IA local responde a /health."
  elif [ "${LOCAL_AI_ONLY:-}" = true ]; then
    apag "La IA local no responde y LOCAL_AI_ONLY=true: las funciones de IA darán 503 hasta encenderla."
  else
    apag "La IA local no responde; se usará otro proveedor si lo hay."
  fi
fi

# ── 4. Copias (S6) ──
titulo "4. Copias de seguridad"
if have docker; then
  salida="$(bash scripts/ops/check-backups.sh 2>&1)"; rc=$?
  [ -z "$salida" ] || printf '%s\n' "$salida" | sed 's/^/     /'
  case "$rc" in
    0) ok "check-backups.sh: copias al día." ;;
    1) aviso "check-backups.sh avisa (ver arriba)." ;;
    *) apag "check-backups.sh no pudo ejecutarse (código $rc)." ;;
  esac
else
  apag "Sin docker: no se llama a check-backups.sh."
fi

titulo "Resumen"
printf '%s OK · %s avisos/degradados · %s errores\n' "$n_ok" "$n_warn" "$n_err"
[ "$n_err" -eq 0 ] || exit 1
exit 0
