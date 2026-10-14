#!/bin/sh
# Sirve el build standalone en :3100 con IA simulada. Uso: serve.sh [true|false] (ALLOW_REGISTRATION).
# Antes: npm run build. Log en /tmp/atlenza-server.log.
cd "$(dirname "$0")/../.."
kill $(ps -eo pid,args | awk '/next-server/ && !/awk/ {print $1}') 2>/dev/null; sleep 1
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
psql "$(grep ^DATABASE_URL= .env.local | cut -d= -f2- | sed 's/?.*//')" -qc 'truncate "RateLimitHit"' 2>/dev/null
cd .next/standalone && set -a && . ../../.env.local && set +a
LIFEOS_FAKE_AI=${LIFEOS_FAKE_AI:-1} LIFEOS_NO_WEATHER=1 SCHEDULER_ENABLED=false AI_LOCAL_BASE_URLS=http://127.0.0.1:39999/v1 \
  ALLOW_REGISTRATION=${1:-true} PORT=3100 nohup node server.js > /tmp/atlenza-server.log 2>&1 &
for i in $(seq 60); do curl -sf -o /dev/null http://localhost:3100/api/health && exit 0; sleep 0.5; done
echo "El servidor no arrancó: mira /tmp/atlenza-server.log"; exit 1
