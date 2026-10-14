#!/bin/sh
# Foto de la BD de desarrollo ANTES de tocar el esquema de una versión (base para regen-mig y test-migration).
# Para que tenga datos: npx prisma migrate deploy && npx prisma db seed && scripts/dev/e2e.sh e2e:v110
# Con --before <MIGRACIÓN>: la foto se deja como estaba ANTES de esa migración (aditiva): se borran las tablas y tipos
# que crea y su fila de _prisma_migrations. Sirve en bloques posteriores al A de una versión, cuyo fichero se regenera entero.
set -e
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
BASE=${DATABASE_URL%%\?*}; ROOT=${BASE%/*}; OUT=/tmp/atlenza-before.dump
if [ "$1" = "--before" ] && [ -n "$2" ]; then
  F=prisma/migrations/$2/migration.sql; [ -f $F ] || { echo "no existe $F"; exit 1; }
  pg_dump -Fc "$BASE" > /tmp/atlenza-dev.dump
  psql "$ROOT/postgres" -qc "drop database if exists atlenza_snap" -c "create database atlenza_snap"
  pg_restore --no-owner -d "$ROOT/atlenza_snap" /tmp/atlenza-dev.dump 2>/dev/null || true
  grep -o '^CREATE TABLE "[A-Za-z_]*"' $F | cut -d'"' -f2 | while read -r t; do psql "$ROOT/atlenza_snap" -qc "drop table if exists \"$t\" cascade"; done
  grep -o '^CREATE TYPE "[A-Za-z_]*"' $F | cut -d'"' -f2 | while read -r t; do psql "$ROOT/atlenza_snap" -qc "drop type if exists \"$t\" cascade"; done
  psql "$ROOT/atlenza_snap" -qc "delete from \"_prisma_migrations\" where migration_name='$2'"
  pg_dump -Fc "$ROOT/atlenza_snap" > $OUT
  psql "$ROOT/postgres" -qc "drop database atlenza_snap"
else
  pg_dump -Fc "$BASE" > $OUT
fi
echo "Guardado $OUT"
