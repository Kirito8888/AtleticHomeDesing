#!/bin/sh
# Hook de inicio de sesión de Claude Code en la web: deja listos Postgres, .env.local, dependencias y BD.
# No hace nada fuera de un contenedor (sin root). Es idempotente: se puede ejecutar varias veces.
cd "$(dirname "$0")/../.."
[ "$(id -u)" = 0 ] || exit 0
missing=""
for p in postgresql-16-pgvector tesseract-ocr tesseract-ocr-spa poppler-utils; do
  dpkg -s $p >/dev/null 2>&1 || missing="$missing $p"
done
if [ -n "$missing" ]; then
  (apt-get update -q && apt-get install -y -q --no-install-recommends $missing) >/tmp/atlenza-apt.log 2>&1 || echo "aviso: no se pudo instalar$missing"
fi
sh scripts/dev/pg-start.sh
sh scripts/dev/env.sh
[ -d node_modules ] || npm ci --no-audit --no-fund >/tmp/atlenza-npm.log 2>&1
set -a; . ./.env.local; set +a
npx prisma generate >/dev/null 2>&1
npx prisma migrate deploy >/tmp/atlenza-migrate.log 2>&1 && npx prisma db seed >>/tmp/atlenza-migrate.log 2>&1 \
  || echo "aviso: migrate/seed falló (ver /tmp/atlenza-migrate.log)"
echo "Entorno de Atlenza listo"
