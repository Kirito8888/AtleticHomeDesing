#!/bin/sh
# Foto de la BD de desarrollo ANTES de tocar el esquema de una versión (base para regen-mig y test-migration).
# Para que tenga datos: npx prisma migrate deploy && npx prisma db seed && scripts/dev/e2e.sh e2e:v110
set -e
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
pg_dump -Fc "${DATABASE_URL%%\?*}" > /tmp/atlenza-before.dump
echo "Guardado /tmp/atlenza-before.dump"
