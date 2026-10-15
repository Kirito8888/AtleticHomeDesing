#!/bin/sh
# Prueba las migraciones pendientes sobre una COPIA de la foto previa: los recuentos y la huella de las
# series no deben cambiar y el esquema debe quedar idéntico a schema.prisma (diff vacío).
# v2.2: antes de medir carga scripts/dev/synthetic-data.sql (usuarias, sesiones, series, intervalos, marcas, carga y un vínculo
# SINTÉTICOS, sin datos reales) para que se compruebe la conservación de datos aunque la BD de dev esté vacía.
# Uso: test-migration.sh [--sin-sinteticos]
set -e
cd "$(dirname "$0")/../.."
DUMP=/tmp/atlenza-before.dump; [ -f $DUMP ] || { echo "Falta $DUMP: ejecuta snapshot.sh antes de cambiar el esquema"; exit 1; }
set -a; . ./.env.local; set +a
BASE=${DATABASE_URL%%\?*}; ROOT=${BASE%/*}; T="$ROOT/atlenza_mig_test"
Q='select (select count(*) from "User"),(select count(*) from "AthleteProfile"),(select count(*) from "TrackInterval"),(select count(*) from "PersonalRecord"),(select count(*) from "CoachAthlete"),(select count(*) from "DailyLoad"),(select md5(string_agg(id||date::text||coalesce(tss::text,'"''"')||coalesce(source,'"''"')||type::text, '"','"' order by id)) from "TrainingSession"),(select count(*) from "TrainingSession"),(select count(*) from "StrengthSet"),(select count(*) from "PlanDay"),(select count(*) from "Posting"),(select count(*) from "Exercise"),(select md5(string_agg(id||"exerciseId"||reps||"weightKg", '"','"' order by id)) from "StrengthSet")'
psql "$ROOT/postgres" -qc "drop database if exists atlenza_mig_test" -c "create database atlenza_mig_test"
pg_restore --no-owner -d "$T" $DUMP 2>/dev/null || true
if [ "$1" != "--sin-sinteticos" ]; then
  psql "$T" -q -v ON_ERROR_STOP=1 -f scripts/dev/synthetic-data.sql || { echo "FALLA: no se pudieron cargar los datos sintéticos"; exit 1; }
  SYN=$(psql "$T" -qtAc "select count(*) from \"TrainingSession\" where id like 'syn-%'")
  [ "$SYN" -gt 0 ] || { echo "FALLA: sin datos sintéticos"; exit 1; }
  echo "sintéticos: $SYN sesiones"
fi
B=$(psql "$T" -qtAc "$Q")
DATABASE_URL="$T?schema=public" npx prisma migrate deploy 2>&1 | grep -E "applied|Error" || true
A=$(psql "$T" -qtAc "$Q")
DIFF=$(DATABASE_URL="$T?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null)
psql "$ROOT/postgres" -qc "drop database atlenza_mig_test"
echo "antes:   $B"; echo "después: $A"
[ "$B" = "$A" ] || { echo "FALLA: cambian los datos"; exit 1; }
echo "$DIFF" | grep -q "empty migration" || { echo "FALLA: el esquema no coincide"; echo "$DIFF"; exit 1; }
echo "OK migración"
