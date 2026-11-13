#!/usr/bin/env bash
# Diagnóstico unificado del servidor de producción: entorno (.env.production), web en vivo y operación (contenedores,
# migraciones, copias, cola, auditoría). SOLO LECTURA y bajo impacto: unas pocas peticiones GET con timeout corto, una
# a una; no escribe datos, no reinicia nada, no lanza tests. Seguro con usuarias activas.
# Ante cada AVISO/ERROR imprime la causa y la solución lista para copiar. Nunca imprime valores del .env (todo enmascarado).
#
# Uso:   bash scripts/ops/doctor.sh                 (menú interactivo; sin terminal equivale a --all)
#        bash scripts/ops/doctor.sh --all | --env | --web | --ops  [--no-color]   (combinables)
# Variables opcionales:
#   ENV_FILE           fichero de entorno (.env.production); se LEE como texto, nunca se ejecuta
#   DOCTOR_BASE_URL    URL de la web (por defecto AUTH_URL del fichero; si no responde, http://127.0.0.1:WEB_PORT)
#   DOCTOR_TIMEOUT_S   segundos máximos por petición (5)
#   COOKIE_SESION      cookie de una sesión válida (solo el valor o «nombre=valor»): comprueba también las rutas internas
#   DB_CONTAINER / WEB_CONTAINER   contenedores (lifeos-db-1 / lifeos-web-1)
#   DOCTOR_SKIP_AUDIT=1  no ejecuta audit-server.sh (lo más lento)
# Códigos de salida: 0 = sin errores (los avisos no cuentan) · 1 = algún ERROR · 2 = uso incorrecto.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

# ─────────────── ACTUALIZAR EN CADA CIERRE DE VERSIÓN (CLAUDE.md, docs/como-trabajar.md) ───────────────
# Última migración de prisma/migrations que debe estar aplicada en producción.
EXPECTED_MIGRATION="20270701080000_v2_9_features"
# Páginas públicas (200 sin sesión) y la API de salud.
PUBLIC_ROUTES=(/login /register /offline /legal/privacidad /legal/condiciones /legal/aviso)
# Páginas privadas: sin sesión deben redirigir (302/307) a /login; con COOKIE_SESION, 200.
PRIVATE_PAGES=(/ /training /nutrition /planning /study /recovery /goals /finance /settings /notifications)
# API privadas GET: sin sesión deben dar 401.
PRIVATE_API=(/api/notifications /api/ai/flashcards/due)
# Claves que, vacías o ausentes, impiden arrancar o dejan la web insegura.
CRITICAL_KEYS=(AUTH_SECRET AUTH_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB TOTP_ENCRYPTION_KEY)
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────

ENV_FILE="${ENV_FILE:-.env.production}"
EXAMPLE_FILE="${EXAMPLE_FILE:-.env.example}"
DB_CONTAINER="${DB_CONTAINER:-lifeos-db-1}"
WEB_CONTAINER="${WEB_CONTAINER:-lifeos-web-1}"
TMO="${DOCTOR_TIMEOUT_S:-5}"
DC="docker compose --env-file $ENV_FILE"
PLACEHOLDERS=" change-me changeme secret dev test password "

do_env=0; do_web=0; do_ops=0; color=1; any=0
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --all) do_env=1; do_web=1; do_ops=1; any=1 ;;
    --env) do_env=1; any=1 ;;
    --web) do_web=1; any=1 ;;
    --ops) do_ops=1; any=1 ;;
    --no-color) color=0 ;;
    *) echo "opción desconocida: $a (usa --help)" >&2; exit 2 ;;
  esac
done
{ [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; } || color=0
if [ "$color" = 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; Z=$'\033[0m'; else G=""; Y=""; R=""; B=""; Z=""; fi

n_ok=0; n_warn=0; n_err=0
have() { command -v "$1" >/dev/null 2>&1; }
titulo() { printf '\n%s== %s ==%s\n' "$B" "$*" "$Z"; }
ok() { printf '%s[OK]%s %s\n' "$G" "$Z" "$*"; n_ok=$((n_ok + 1)); }
# detalle CAUSA [COMANDO...]: imprime la causa y la solución copiable.
detalle() {
  printf '        Causa: %s\n' "$1"; shift
  [ $# -gt 0 ] || return 0
  printf '        Solución:\n'
  for c in "$@"; do printf '          %s\n' "$c"; done
}
aviso() { printf '%s[AVISO]%s %s\n' "$Y" "$Z" "$1"; shift; n_warn=$((n_warn + 1)); [ $# -eq 0 ] || detalle "$@"; }
fallo() { printf '%s[ERROR]%s %s\n' "$R" "$Z" "$1"; shift; n_err=$((n_err + 1)); [ $# -eq 0 ] || detalle "$@"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

# ─────────────── lectura del .env (sin ejecutarlo; los valores se quedan en memoria) ───────────────
declare -A VAL=()
env_loaded=0
load_env() {
  [ "$env_loaded" = 1 ] && return 0
  env_loaded=1
  [ -r "$ENV_FILE" ] || return 0
  local line k v
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*|[[:space:]]*'#'*) continue ;; esac
    line="${line#export }"
    [[ "$line" == *=* ]] || continue
    k="${line%%=*}"; k="${k%"${k##*[![:space:]]}"}"; v="${line#*=}"; v="${v#"${v%%[![:space:]]*}"}"
    case "$v" in \"*\") v="${v:1:${#v}-2}" ;; \'*\') v="${v:1:${#v}-2}" ;; esac
    VAL["$k"]="$v"
  done < "$ENV_FILE"
}
val() { printf '%s' "${VAL[$1]-}"; }
is_set() { [ -n "${VAL[$1]-}" ]; }
is_placeholder() { case "$PLACEHOLDERS" in *" $(printf '%s' "$1" | tr '[:upper:]' '[:lower:]') "*) return 0 ;; esac; return 1; }
# Muestra una URL sin host (el dominio no sale en la salida).
mask_url() { printf '%s' "$1" | sed -E 's#^([a-zA-Z]+://)[^/]*(.*)#\1***#'; }

# ─────────────── 1. Entorno ───────────────
check_env() {
  titulo "1. Entorno ($ENV_FILE)"
  if [ ! -e "$ENV_FILE" ]; then
    fallo "No existe $ENV_FILE." "docker compose no puede arrancar la web sin él." "cp .env.example $ENV_FILE && chmod 600 $ENV_FILE   # y rellena los valores"
    return
  fi
  if [ ! -r "$ENV_FILE" ]; then
    fallo "No se puede leer $ENV_FILE con este usuario." "permisos o propietario distintos." "sudo bash scripts/ops/doctor.sh --env"
    return
  fi
  local perm; perm="$(stat -c %a "$ENV_FILE" 2>/dev/null || echo '?')"
  if [ "$perm" = 600 ] || [ "$perm" = 400 ]; then ok "Permisos de $ENV_FILE: $perm."
  else aviso "Permisos de $ENV_FILE: $perm (otros usuarios del equipo pueden leer los secretos)." "el fichero no está en 600." "bash scripts/ops/secure-env-permissions.sh --apply ."; fi

  # Sintaxis, línea a línea (se cita el número de línea, nunca el valor).
  local n=0 bad=0 line k v first last
  declare -A seen=()
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    if [[ "$line" == *$'\r' ]]; then
      fallo "Línea $n: termina en CRLF (formato Windows)." "Docker guarda el \\r dentro del valor y las claves dejan de coincidir." "sed -i 's/\\r\$//' $ENV_FILE"
      bad=1; line="${line%$'\r'}"
    fi
    case "$line" in ''|'#'*|[[:space:]]*'#'*) continue ;; [[:space:]]*) [ -z "${line//[[:space:]]/}" ] && continue ;; esac
    if [[ "$line" == "export "* ]]; then
      fallo "Línea $n: empieza por «export »." "env_file de Docker no admite «export»: la clave no se carga." "sed -i 's/^export //' $ENV_FILE"
      bad=1; continue
    fi
    if [[ "$line" != *=* ]]; then
      fallo "Línea $n: no tiene «=»." "Docker la rechaza o la ignora." "sed -n '${n}p' $ENV_FILE   # revísala y corrígela o coméntala con #"
      bad=1; continue
    fi
    k="${line%%=*}"; v="${line#*=}"
    if [[ "$k" =~ [[:space:]]$ ]] || [[ "$v" =~ ^[[:space:]] ]] || [[ "$k" =~ ^[[:space:]] ]]; then
      fallo "Línea $n: espacios alrededor de «=»." "la clave o el valor llegan con espacios y no coinciden." "sed -i -E '${n}s/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*/\\1=/' $ENV_FILE"
      bad=1; k="${k//[[:space:]]/}"
    fi
    if ! [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      fallo "Línea $n: nombre de variable no válido." "solo letras, números y _, sin empezar por número." "sed -n '${n}p' $ENV_FILE | cut -d= -f1"
      bad=1; continue
    fi
    first="${v:0:1}"; last="${v: -1}"
    if { [ "$first" = '"' ] || [ "$first" = "'" ]; } && { [ "${#v}" -lt 2 ] || [ "$last" != "$first" ]; }; then
      fallo "Línea $n ($k): comilla de apertura sin cerrar." "docker compose falla al leer el fichero o se come las líneas siguientes." "nano +$n $ENV_FILE   # cierra la comilla o quítalas"
      bad=1
    elif { [ "$last" = '"' ] || [ "$last" = "'" ]; } && [ "$first" != "$last" ]; then
      fallo "Línea $n ($k): comilla de cierre sin abrir." "la comilla pasa a formar parte del valor." "nano +$n $ENV_FILE   # quita la comilla final"
      bad=1
    elif [ "$first" != "'" ] && [[ "$v" == *'$'* ]]; then
      aviso "Línea $n ($k): el valor contiene «\$»." "docker compose interpola \$… en env_file y puede cambiar el secreto." "nano +$n $ENV_FILE   # escribe el valor entre comillas simples '…' o usa \$\$"
    fi
    if [ -n "${seen[$k]-}" ]; then
      aviso "$k aparece dos veces (líneas ${seen[$k]} y $n); gana la última." "duplicado al copiar la plantilla." "grep -n '^$k=' $ENV_FILE   # deja una sola"
    fi
    seen["$k"]="$n"
  done < "$ENV_FILE"
  [ "$bad" = 1 ] || ok "Sintaxis compatible con env_file de Docker ($n líneas)."

  load_env

  # Claves frente a .env.example
  if [ -r "$EXAMPLE_FILE" ]; then
    local missing=() key
    while IFS= read -r key; do
      [ -n "${VAL[$key]+x}" ] || missing+=("$key")
    done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$EXAMPLE_FILE" | cut -d= -f1 | grep -vx DATABASE_URL | sort -u)
    if [ "${#missing[@]}" -eq 0 ]; then ok "Están todas las claves de $EXAMPLE_FILE."
    else aviso "Faltan claves de $EXAMPLE_FILE: ${missing[*]}." "el .env es de una versión anterior; se usarán los valores por defecto." \
      "diff <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' $EXAMPLE_FILE | sort -u) <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' $ENV_FILE | sort -u)"; fi
  else
    aviso "No se encuentra $EXAMPLE_FILE para comparar las claves." "el repositorio no está completo en esta carpeta." "git status --short $EXAMPLE_FILE"
  fi

  local crit_ok=1
  for key in "${CRITICAL_KEYS[@]}"; do
    if ! is_set "$key"; then
      crit_ok=0
      case "$key" in
        AUTH_SECRET|TOTP_ENCRYPTION_KEY) fallo "$key vacía o ausente." "sin ella no hay sesiones seguras / no se pueden cifrar los datos de salud ni la 2FA." "echo \"$key=\$(openssl rand -base64 32)\" >> $ENV_FILE   # solo si no existía; si ya tenía valor, NO lo cambies" ;;
        AUTH_URL) fallo "AUTH_URL vacía o ausente." "Auth.js no sabe con qué URL pública se accede." "echo 'AUTH_URL=https://TU_DOMINIO' >> $ENV_FILE" ;;
        *) fallo "$key vacía o ausente." "docker compose no puede crear la base de datos sin ella." "nano $ENV_FILE   # define $key (ver .env.example)" ;;
      esac
    fi
  done
  [ "$crit_ok" = 0 ] || ok "Claves imprescindibles definidas (${CRITICAL_KEYS[*]})."

  # Formato de URL y secretos (solo se muestran longitudes y esquemas)
  local u; u="$(val AUTH_URL)"
  if [ -n "$u" ]; then
    local host; host="$(printf '%s' "$u" | sed -E 's#^[a-zA-Z]+://([^/:]+).*#\1#')"
    if ! [[ "$u" =~ ^https?://[^/[:space:]]+(/.*)?$ ]]; then
      fallo "AUTH_URL no es una URL válida ($(mask_url "$u"))." "falta el esquema o tiene espacios." "nano $ENV_FILE   # AUTH_URL=https://TU_DOMINIO"
    elif [ "$host" = localhost ] || [ "$host" = 127.0.0.1 ]; then
      aviso "AUTH_URL apunta a esta máquina ($(mask_url "$u"))." "válido solo para pruebas locales: los enlaces y el inicio de sesión no funcionarán desde fuera." "nano $ENV_FILE   # AUTH_URL=https://TU_DOMINIO"
    elif [[ "$u" != https://* ]]; then
      fallo "AUTH_URL no usa https (${u%%://*}://***)." "la app rechaza arrancar en producción sin https (src/lib/env.ts)." "nano $ENV_FILE   # AUTH_URL=https://TU_DOMINIO"
    elif [[ "$u" == */ ]]; then
      aviso "AUTH_URL termina en «/»." "algunas redirecciones quedan con doble barra." "sed -i -E 's#^(AUTH_URL=.*[^/])/+\$#\\1#' $ENV_FILE"
    else ok "AUTH_URL con https ($(mask_url "$u"))."; fi
  fi
  local s; s="$(val AUTH_SECRET)"
  if [ -n "$s" ]; then
    if [ "${#s}" -lt 32 ] || is_placeholder "$s"; then
      fallo "AUTH_SECRET demasiado corta o de ejemplo (${#s} caracteres)." "la app no arranca en producción (src/lib/env.ts) y las sesiones serían adivinables." "sed -i \"s#^AUTH_SECRET=.*#AUTH_SECRET=\$(openssl rand -base64 32)#\" $ENV_FILE   # cierra todas las sesiones"
    else ok "AUTH_SECRET con longitud suficiente (${#s} caracteres)."; fi
  fi
  s="$(val TOTP_ENCRYPTION_KEY)"
  if [ -n "$s" ] && { [ "${#s}" -lt 32 ] || is_placeholder "$s"; }; then
    aviso "TOTP_ENCRYPTION_KEY corta o de ejemplo (${#s} caracteres)." "clave débil para la 2FA y la salud cifrada." "# NO la cambies si ya hay 2FA o datos de salud: se perderían. Ver docs/seguridad-incidentes.md"
  fi
  for key in POSTGRES_PASSWORD PGADMIN_DEFAULT_PASSWORD; do
    s="$(val "$key")"
    if [ -n "$s" ] && is_placeholder "$s"; then
      fallo "$key es la de ejemplo." "cualquiera que conozca la plantilla entra en la base de datos." "# cámbiala en Postgres (ALTER USER) y después en $ENV_FILE; ver docs/servidor-hardening.md"
    fi
  done
  if { is_set VAPID_PUBLIC_KEY && ! is_set VAPID_PRIVATE_KEY; } || { ! is_set VAPID_PUBLIC_KEY && is_set VAPID_PRIVATE_KEY; }; then
    aviso "Solo está una de las claves VAPID." "las notificaciones push no funcionarán." "npx web-push generate-vapid-keys   # pon las dos en $ENV_FILE"
  fi
  for key in LOCAL_AI_BASE_URL OFF_BASE_URL; do
    s="$(val "$key")"
    if [ -n "$s" ] && ! [[ "$s" =~ ^https?://[^/[:space:]]+ ]]; then
      aviso "$key no es una URL http(s) válida ($(mask_url "$s"))." "la llamada fallará." "nano $ENV_FILE   # $key=http://IP_DEL_SERVIDOR:PUERTO/..."
    fi
  done
  s="$(val LOCAL_AI_ONLY)"
  if [ -n "$s" ] && [ "$s" != true ] && [ "$s" != false ]; then
    aviso "LOCAL_AI_ONLY no es true ni false." "se interpreta como false: la IA podría salir a otro proveedor." "sed -i 's/^LOCAL_AI_ONLY=.*/LOCAL_AI_ONLY=true/' $ENV_FILE"
  fi
  if [ "$(val WEB_BIND)" = 0.0.0.0 ]; then
    aviso "WEB_BIND=0.0.0.0: la web escucha en todas las interfaces." "Docker se salta ufw: el puerto queda expuesto sin el proxy HTTPS." "sed -i 's/^WEB_BIND=.*/WEB_BIND=127.0.0.1/' $ENV_FILE && $DC up -d web"
  fi
}

# ─────────────── 2. Web en vivo ───────────────
CODE=""; LOC=""
# req RUTA [cookie]: GET sin seguir redirecciones. Deja CODE, LOC y el cuerpo en $TMP/body (cabeceras en $TMP/hdr).
req() {
  local url="$BASE$1" args=(-sS -m "$TMO" --max-redirs 0 -o "$TMP/body" -D "$TMP/hdr" -w '%{http_code}')
  : > "$TMP/body"; : > "$TMP/hdr"
  if [ "${2:-}" = cookie ]; then
    CODE="$(printf 'Cookie: %s\n' "$COOKIE_HDR" | curl "${args[@]}" -H @- "$url" 2>/dev/null)"
  else
    CODE="$(curl "${args[@]}" "$url" 2>/dev/null)"
  fi
  [ -n "$CODE" ] || CODE=000
  LOC="$(grep -i '^location:' "$TMP/hdr" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r')"
}

LOGS_WEB="$DC logs --tail 100 web"
check_web() {
  titulo "2. Web en vivo"
  if ! have curl; then fallo "Falta curl." "no se pueden hacer las peticiones." "sudo apt-get install -y curl"; return; fi
  load_env
  local port bind local_url
  port="$(val WEB_PORT)"; port="${port:-3000}"
  bind="$(val WEB_BIND)"; { [ -z "$bind" ] || [ "$bind" = 0.0.0.0 ]; } && bind=127.0.0.1
  local_url="http://$bind:$port"
  BASE="${DOCTOR_BASE_URL:-$(val AUTH_URL)}"; BASE="${BASE:-$local_url}"; BASE="${BASE%/}"
  echo "     Web: $(mask_url "$BASE") · timeout ${TMO}s por petición, sin seguir redirecciones"

  req /api/health
  if [ "$CODE" = 000 ] && [ -z "${DOCTOR_BASE_URL:-}" ] && [ "$BASE" != "$local_url" ]; then
    aviso "La URL pública no responde desde este equipo; se prueba la local ($(mask_url "$local_url"))." \
      "el proxy HTTPS, el DNS o el NAT de vuelta no llegan desde el propio servidor." "curl -sSI -m 5 \"\$(grep '^AUTH_URL=' $ENV_FILE | cut -d= -f2-)/api/health\"   # mira el error exacto"
    BASE="$local_url"; req /api/health
  fi
  local st; st="$(grep -o '"status":"[^"]*"' "$TMP/body" 2>/dev/null | head -1 | cut -d'"' -f4)"
  case "$CODE" in
    200) if [ "$st" = ok ]; then ok "/api/health → 200 (ok)."
         else aviso "/api/health → 200 pero «${st:-?}»." "la cola de trabajos tiene atascos o fallos (la web sigue funcionando)." "bash scripts/ops/queue-failed.sh"; fi ;;
    503) fallo "/api/health → 503 (caído)." "la web no llega a la base de datos." "$DC ps db" "$DC logs --tail 100 db" "$DC up -d db   # si está parada" ;;
    000) fallo "/api/health no responde (timeout o conexión rechazada)." "el contenedor web está parado, arrancando o colgado." "$DC ps web" "$LOGS_WEB" "$DC up -d web   # si está parado" ;;
    *) fallo "/api/health → $CODE." "error interno de la web." "$LOGS_WEB" ;;
  esac
  [ "$CODE" = 000 ] && { aviso "Se omiten el resto de rutas: la web no responde."; return; }

  local r bad=0
  for r in "${PUBLIC_ROUTES[@]}"; do
    req "$r"
    case "$CODE" in
      200) : ;;
      3??) if [[ "$LOC" == *"$r"* ]]; then :; else bad=1; aviso "$r → $CODE (redirige a otra página)." "una página pública pide sesión o se ha movido." "curl -sSI -m 5 $(mask_url "$BASE")$r   # (pon tu dominio)"; fi ;;
      5??) bad=1; fallo "$r → $CODE." "la página pública falla en el servidor." "$LOGS_WEB | grep -i error" ;;
      000) bad=1; fallo "$r no responde." "la web se ha colgado o el timeout (${TMO}s) es corto." "$LOGS_WEB" ;;
      *) bad=1; aviso "$r → $CODE." "respuesta inesperada (¿ruta movida? actualiza PUBLIC_ROUTES en doctor.sh)." ;;
    esac
  done
  [ "$bad" = 1 ] || ok "Páginas públicas → 200 (${#PUBLIC_ROUTES[@]})."

  # Cabeceras de seguridad (de la última petición a /login)
  req /login
  if [ "$CODE" = 200 ]; then
    if grep -qi '^content-security-policy:' "$TMP/hdr"; then ok "/login envía Content-Security-Policy."
    else aviso "/login sin Content-Security-Policy." "el proxy de Next (src/proxy.ts) no se está aplicando o el proxy HTTPS la quita." "$LOGS_WEB"; fi
    if [[ "$BASE" == https://* ]] && ! grep -qi '^strict-transport-security:' "$TMP/hdr"; then
      aviso "Sin Strict-Transport-Security por https." "el proxy HTTPS no añade HSTS." "# En Nginx Proxy Manager: Proxy Host → SSL → «HSTS Enabled»"
    fi
  fi

  bad=0
  for r in "${PRIVATE_PAGES[@]}"; do
    req "$r"
    case "$CODE" in
      302|303|307|308) if [[ "$LOC" == *"/login"* ]]; then :; else bad=1; aviso "$r → $CODE pero no hacia /login." "redirección inesperada." "curl -sSI -m 5 $(mask_url "$BASE")$r   # (pon tu dominio)"; fi ;;
      200) bad=1; fallo "$r → 200 SIN sesión." "la protección de páginas (src/proxy.ts) no se aplica: datos privados expuestos." "$DC up -d --force-recreate web   # y revisa el último despliegue" "git log -3 --oneline" ;;
      5??) bad=1; fallo "$r → $CODE sin sesión." "error interno antes de redirigir (¿AUTH_SECRET o AUTH_URL mal?)." "$LOGS_WEB | grep -iE 'auth|error'" ;;
      000) bad=1; fallo "$r no responde." "la web se ha colgado." "$LOGS_WEB" ;;
      *) bad=1; aviso "$r → $CODE sin sesión." "respuesta inesperada (¿ruta movida? actualiza PRIVATE_PAGES en doctor.sh)." ;;
    esac
  done
  [ "$bad" = 1 ] || ok "Páginas privadas sin sesión → redirigen a /login (${#PRIVATE_PAGES[@]})."

  bad=0
  for r in "${PRIVATE_API[@]}"; do
    req "$r"
    case "$CODE" in
      401) : ;;
      200) bad=1; fallo "$r → 200 SIN sesión." "la API privada no comprueba la sesión." "$LOGS_WEB" ;;
      5??) bad=1; fallo "$r → $CODE." "la API falla en el servidor." "$LOGS_WEB | grep -i error" ;;
      *) bad=1; aviso "$r → $CODE sin sesión (se esperaba 401)." "¿ruta movida? actualiza PRIVATE_API en doctor.sh." ;;
    esac
  done
  [ "$bad" = 1 ] || ok "API privadas sin sesión → 401 (${#PRIVATE_API[@]})."

  if [ -n "${COOKIE_SESION:-}" ]; then
    if [[ "$COOKIE_SESION" == *=* ]]; then COOKIE_HDR="$COOKIE_SESION"
    elif [[ "$BASE" == https://* ]]; then COOKIE_HDR="__Secure-authjs.session-token=$COOKIE_SESION"
    else COOKIE_HDR="authjs.session-token=$COOKIE_SESION"; fi
    bad=0
    for r in "${PRIVATE_PAGES[@]}" "${PRIVATE_API[@]}"; do
      req "$r" cookie
      case "$CODE" in
        200) : ;;
        3??) bad=1
             if [[ "$LOC" == *"/login"* ]]; then aviso "$r con COOKIE_SESION → /login." "la cookie ha caducado o no es de esta web." "# vuelve a copiarla del navegador (DevTools → Aplicación → Cookies)"; break
             else aviso "$r con sesión → $CODE." "redirección inesperada (¿bienvenida u onboarding pendiente?)."; fi ;;
        401) bad=1; aviso "$r con COOKIE_SESION → 401." "la cookie no vale para la API (caducada o de otra web)."; break ;;
        5??) bad=1; fallo "$r con sesión → $CODE." "la página falla para usuarias con sesión." "$LOGS_WEB | grep -i error" ;;
        *) bad=1; aviso "$r con sesión → $CODE." "respuesta inesperada." ;;
      esac
    done
    [ "$bad" = 1 ] || ok "Rutas internas con sesión → 200 ($(( ${#PRIVATE_PAGES[@]} + ${#PRIVATE_API[@]} )))."
  else
    echo "     (sin COOKIE_SESION: no se prueban las rutas internas con sesión)"
  fi
}

# ─────────────── 3. Operación ───────────────
# shellcheck disable=SC2016  # POSTGRES_* se expanden DENTRO del contenedor
sql() {
  have docker || return 1
  docker exec -i "$DB_CONTAINER" sh -c 'exec psql -qtA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null
}
# sangra la salida de un script delegado
indent() { sed 's/^/     │ /'; }

check_ops() {
  titulo "3. Operación"
  load_env
  if ! have docker; then
    fallo "No hay docker en este equipo (o en el PATH de este usuario)." "no se pueden revisar contenedores, base de datos ni copias." "sudo bash scripts/ops/doctor.sh --ops"
  else
    local c info st hs rc
    for c in "$WEB_CONTAINER" "$DB_CONTAINER"; do
      info="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' "$c" 2>/dev/null)" || info=""
      read -r st hs rc <<<"$info"
      if [ -z "$info" ]; then fallo "Contenedor $c no encontrado." "no está creado o tiene otro nombre (variables WEB_CONTAINER/DB_CONTAINER)." "$DC ps" "$DC up -d"
      elif [ "$st" != running ]; then fallo "Contenedor $c: $st." "está parado." "$DC logs --tail 100 ${c#lifeos-}" "$DC up -d"
      elif [ "$hs" = unhealthy ]; then fallo "Contenedor $c: en marcha pero unhealthy." "su healthcheck falla." "docker inspect -f '{{json .State.Health.Log}}' $c | tail -c 1500"
      elif [ "${rc:-0}" -gt 0 ] 2>/dev/null; then aviso "Contenedor $c en marcha, pero se ha reiniciado ${rc} veces." "se cae y Docker lo levanta (memoria, error al arrancar…)." "$DC logs --tail 200 ${c#lifeos-} | grep -iE 'error|killed|oom'"
      else ok "Contenedor $c en marcha (${hs/none/sin healthcheck})."; fi
    done

    # Migraciones
    local aplicadas pend="" d m
    aplicadas="$(printf '%s\n' "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by migration_name;" | sql)" || aplicadas=""
    if [ -z "$aplicadas" ]; then
      fallo "No se pudo leer _prisma_migrations." "la base de datos no responde o el contenedor $DB_CONTAINER no existe." "$DC ps db" "$DC logs --tail 100 db"
    else
      if printf '%s\n' "$aplicadas" | grep -qx "$EXPECTED_MIGRATION"; then ok "Migración esperada de esta versión aplicada ($EXPECTED_MIGRATION)."
      else fallo "Falta la migración $EXPECTED_MIGRATION." "el despliegue no terminó o se hizo sin update.sh." "bash scripts/update.sh"; fi
      for d in prisma/migrations/*/; do
        m="$(basename "$d")"; [ -f "$d/migration.sql" ] || continue
        printf '%s\n' "$aplicadas" | grep -qx "$m" || pend="$pend $m"
      done
      [ -z "$pend" ] || fallo "Migraciones del repositorio sin aplicar:$pend." "el código es más nuevo que la base de datos." "bash scripts/update.sh"
      local fallidas
      fallidas="$(printf '%s\n' "select count(*) from _prisma_migrations where finished_at is null and rolled_back_at is null;" | sql)" || fallidas=""
      if [ -n "$fallidas" ] && [ "$fallidas" != 0 ] 2>/dev/null && [[ "$fallidas" =~ ^[0-9]+$ ]]; then
        fallo "Hay $fallidas migración(es) a medias." "una migración falló al aplicarse: Prisma bloquea las siguientes." "printf 'select migration_name, logs from _prisma_migrations where finished_at is null;\\n' | docker exec -i $DB_CONTAINER sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"
      fi
    fi

    # Copias
    local out
    out="$(bash scripts/ops/check-backups.sh 2>&1)"; rc=$?
    printf '%s\n' "$out" | indent
    case "$rc" in
      0) ok "check-backups.sh: copias al día." ;;
      *) aviso "check-backups.sh avisa (arriba)." "el servicio de copias no corre o falla." "$DC --profile backup ps backup" "$DC --profile backup logs --tail 50 backup" "bash scripts/ops/verify-backup.sh   # comprueba la última copia" ;;
    esac

    # Cola: queue-failed.sh SIN acciones (solo lista). Solo se muestran los recuentos por cola, no los mensajes de error.
    out="$(bash scripts/ops/queue-failed.sh 2>&1)"; rc=$?
    if [ "$rc" != 0 ]; then
      aviso "queue-failed.sh no pudo leer la cola (código $rc)." "base de datos inaccesible o la cola aún no existe." "bash scripts/ops/queue-failed.sh"
    else
      local counts
      counts="$(printf '%s\n' "$out" | awk -F'|' '/^-+\+/{t=1; next} t && /\|/ {gsub(/^ +| +$/, "", $1); c[$1]++} END {for (k in c) printf "%s=%d ", k, c[k]}')"
      if [ -z "$counts" ]; then ok "Cola: sin trabajos fallidos."
      else aviso "Cola con trabajos fallidos: $counts" "trabajos de fondo (paquetes de estudio, informes…) fallaron; las usuarias no los reciben." \
        "bash scripts/ops/queue-failed.sh   # ver el error de cada uno" "bash scripts/ops/queue-failed.sh --retry --queue NOMBRE   # simula; añade --apply para reintentar"; fi
    fi

    # verify-hito-0.sh (Chromium/PDF, IA local, BD): solo se muestran sus avisos y errores.
    out="$(bash scripts/ops/verify-hito-0.sh --no-color 2>&1)"; rc=$?
    printf '%s\n' "$out" | grep -E '^\[(AVISO|ERROR|DEGRADADO)' | grep -v 'check-backups' | indent
    case "$rc" in
      0) ok "verify-hito-0.sh sin errores (Chromium, IA, BD)." ;;
      *) fallo "verify-hito-0.sh informa de errores (arriba)." "Chromium, IA local o base de datos." "bash scripts/ops/verify-hito-0.sh   # salida completa" ;;
    esac
  fi

  # Disco
  local pct dir
  for dir in . "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null)"; do
    [ -n "$dir" ] && [ -d "$dir" ] || continue
    pct="$(df -P "$dir" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
    [ -n "$pct" ] || continue
    if [ "$pct" -ge 90 ]; then fallo "Disco al ${pct}% ($dir)." "sin espacio la BD y las copias fallan." "bash scripts/ops/prune-after-update.sh" "docker system df"
    elif [ "$pct" -ge 85 ]; then aviso "Disco al ${pct}% ($dir)." "poco margen para imágenes y copias." "bash scripts/ops/prune-after-update.sh" "docker system df"
    else ok "Disco al ${pct}% ($([ "$dir" = . ] && echo repositorio || echo Docker))."; fi
  done

  # Auditoría del servidor (resumen de sus avisos)
  if [ "${DOCTOR_SKIP_AUDIT:-0}" = 1 ]; then
    echo "     (DOCTOR_SKIP_AUDIT=1: se omite audit-server.sh)"
  else
    [ "$(id -u)" = 0 ] || echo "     audit-server.sh sin root: informe parcial (para el completo: sudo sh scripts/ops/audit-server.sh > auditoria.md)"
    local aud tcmd=()
    have timeout && tcmd=(timeout 120)
    aud="$(AUDIT_TIMEOUT=10 "${tcmd[@]}" sh scripts/ops/audit-server.sh 2>/dev/null | grep -E '⚠️' | sed 's/^- //' | sort -u)"
    if [ -z "$aud" ]; then ok "audit-server.sh sin avisos."
    else
      printf '%s\n' "$aud" | indent
      aviso "audit-server.sh tiene $(printf '%s\n' "$aud" | wc -l) aviso(s) (arriba)." "configuración del servidor mejorable." "sudo sh scripts/ops/audit-server.sh > auditoria.md   # informe completo; guía: docs/servidor-auditoria.md"
    fi
  fi
}

run() {
  n_ok=0; n_warn=0; n_err=0
  printf '%sAtlenza · doctor (solo lectura)%s · %s UTC\n' "$B" "$Z" "$(date -u '+%Y-%m-%d %H:%M')"
  [ "$do_env" = 0 ] || check_env
  [ "$do_web" = 0 ] || check_web
  [ "$do_ops" = 0 ] || check_ops
  titulo "Resumen"
  printf '%s OK · %s%s avisos%s · %s%s errores%s\n' "$n_ok" "$Y" "$n_warn" "$Z" "$R" "$n_err" "$Z"
  [ "$n_err" -eq 0 ]
}

if [ "$any" = 0 ]; then
  if [ -t 0 ] && [ -t 1 ]; then
    rc=0
    while :; do
      printf '\n%sAtlenza · doctor%s (solo lectura, seguro con usuarias activas)\n' "$B" "$Z"
      printf '  1) Entorno (.env.production)\n  2) Web en vivo\n  3) Operación (contenedores, migraciones, copias, cola, auditoría)\n  4) Todo\n  5) Salir\n'
      read -r -p 'Elige [1-5]: ' op || break
      do_env=0; do_web=0; do_ops=0
      case "$op" in
        1) do_env=1 ;; 2) do_web=1 ;; 3) do_ops=1 ;; 4) do_env=1; do_web=1; do_ops=1 ;;
        5|q|Q|'') break ;;
        *) echo "Opción no válida."; continue ;;
      esac
      run; rc=$?
    done
    exit "$rc"
  fi
  do_env=1; do_web=1; do_ops=1
fi
run || exit 1
exit 0
