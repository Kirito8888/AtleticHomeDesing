#!/bin/sh
# (Re)genera UNA migración desde la foto previa (snapshot.sh) hasta schema.prisma y la marca como
# aplicada en la BD de desarrollo. Uso: regen-mig.sh 20270101080000_v2_0_features "comentario"
set -e
cd "$(dirname "$0")/../.."
NAME=$1; NOTE=${2:-"solo añade tablas y columnas"}; DUMP=/tmp/atlenza-before.dump
[ -n "$NAME" ] && [ -f $DUMP ] || { echo "uso: regen-mig.sh <nombre> [comentario]; antes, snapshot.sh"; exit 1; }
set -a; . ./.env.local; set +a
BASE=${DATABASE_URL%%\?*}; ROOT=${BASE%/*}; F=prisma/migrations/$NAME/migration.sql
mkdir -p prisma/migrations/$NAME
psql "$ROOT/postgres" -qc "drop database if exists atlenza_mig_base" -c "create database atlenza_mig_base"
pg_restore --no-owner -d "$ROOT/atlenza_mig_base" $DUMP 2>/dev/null || true
{ echo "-- $NOTE"; DATABASE_URL="$ROOT/atlenza_mig_base?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null; } > $F
DELTA=$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null)
echo "$DELTA" | grep -q "empty migration" || echo "$DELTA" | psql "$BASE" -q
npx prisma migrate resolve --applied $NAME >/dev/null 2>&1 || true
psql "$BASE" -qc "update \"_prisma_migrations\" set checksum='$(sha256sum $F | cut -d' ' -f1)' where migration_name='$NAME'"
psql "$ROOT/postgres" -qc "drop database atlenza_mig_base"
echo "Tablas nuevas: $(grep -c 'CREATE TABLE' $F)"; grep -n "DROP\|ALTER COLUMN" $F || true
npx prisma generate >/dev/null 2>&1
