#!/bin/sh
# v1.9 · Vigilancia desde el propio servidor: si la web no responde, avisa por Telegram.
# La app vigila lo demás (BD, copias, cola, disco, errores) y avisa ella misma; esto cubre el caso
# en que la app entera está caída y no puede avisar. Nada sale del servidor salvo el mensaje.
#
# Uso (crontab del usuario que despliega, cada 5 minutos):
#   */5 * * * * cd /ruta/a/AtleticHomeDesing && sh scripts/watchdog.sh >/dev/null 2>&1
# Lee TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, WEB_BIND y WEB_PORT de .env.production.
# Avisa al segundo fallo seguido (evita falsas alarmas durante un update.sh) y cuando se recupera.
set -u
ENV_FILE="${ENV_FILE:-.env.production}"
STATE="${WATCHDOG_STATE:-${TMPDIR:-/tmp}/atlenza-watchdog.state}"
envval() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }

TOKEN="$(envval TELEGRAM_BOT_TOKEN)"
CHAT="$(envval TELEGRAM_ADMIN_CHAT_ID)"
API="$(envval TELEGRAM_API_URL)"; API="${API:-https://api.telegram.org}"
BIND="$(envval WEB_BIND)"; BIND="${BIND:-127.0.0.1}"; [ "$BIND" = "0.0.0.0" ] && BIND=127.0.0.1
PORT="$(envval WEB_PORT)"; PORT="${PORT:-3000}"
URL="${WATCHDOG_URL:-http://$BIND:$PORT/api/health}"

send() {
  [ -n "$TOKEN" ] && [ -n "$CHAT" ] || { echo "$1"; return 0; }
  curl -fsS -m 10 -X POST "$API/bot$TOKEN/sendMessage" \
    --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$1" >/dev/null 2>&1 || echo "no se pudo avisar por Telegram"
}

prev="$(cat "$STATE" 2>/dev/null || echo 0)"
if curl -fsS -m 10 -o /dev/null "$URL"; then
  [ "$prev" -ge 2 ] 2>/dev/null && send "✅ Atlenza vuelve a responder ($(hostname))."
  echo 0 > "$STATE"
else
  n=$((prev + 1)); echo "$n" > "$STATE"
  [ "$n" -eq 2 ] && send "⚠️ Atlenza no responde en $(hostname) ($URL). Revisa: docker compose --env-file $ENV_FILE ps"
fi
exit 0
