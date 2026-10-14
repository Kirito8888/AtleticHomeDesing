#!/bin/sh
# Prueba las migraciones pendientes sobre una COPIA de la foto previa: los recuentos y la huella de las
# series no deben cambiar y el esquema debe quedar idéntico a schema.prisma (diff vacío).
set -e
cd "$(dirname "$0")/../.."
DUMP=/tmp/atlenza-before.dump; [ -f $DUMP ] || { echo "Falta $DUMP: ejecuta snapshot.sh antes de cambiar el esquema"; exit 1; }
set -a; . ./.env.local; set +a
BASE=${DATABASE_URL%%\?*}; ROOT=${BASE%/*}; T="$ROOT/atlenza_mig_test"
Q='select (select count(*) from "User"),(select count(*) from "TrainingSession"),(select count(*) from "StrengthSet"),(select count(*) from "PlanDay"),(select count(*) from "Posting"),(select count(*) from "Exercise"),(select md5(string_agg(id||"exerciseId"||reps||"weightKg", '"','"' order by id)) from "StrengthSet")'
psql "$ROOT/postgres" -qc "drop database if exists atlenza_mig_test" -c "create database atlenza_mig_test"
pg_restore --no-owner -d "$T" $DUMP 2>/dev/null || true
B=$(psql "$T" -qtAc "$Q")
DATABASE_URL="$T?schema=public" npx prisma migrate deploy 2>&1 | grep -E "applied|Error" || true
A=$(psql "$T" -qtAc "$Q")
DIFF=$(DATABASE_URL="$T?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null)
psql "$ROOT/postgres" -qc "drop database atlenza_mig_test"
echo "antes:   $B"; echo "después: $A"
[ "$B" = "$A" ] || { echo "FALLA: cambian los datos"; exit 1; }
echo "$DIFF" | grep -q "empty migration" || { echo "FALLA: el esquema no coincide"; echo "$DIFF"; exit 1; }
echo "OK migración"
