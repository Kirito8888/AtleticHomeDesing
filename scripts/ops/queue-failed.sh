#!/usr/bin/env bash
# Inspecciona los trabajos FALLIDOS de la cola pg-boss (esquema pgboss) y permite reintentarlos o descartarlos.
# Por defecto solo LEE y, si pides una acción, la SIMULA: nada cambia sin --apply. No toca el esquema ni el código de la app.
#
# Uso:   bash scripts/ops/queue-failed.sh [--queue NOMBRE] [--id UUID]... [--retry | --discard] [--apply] [--dry-run] [-h|--help]
#   (sin acción)  lista los fallidos: cola, id, reintentos, fechas y el error (recortado a 600 caracteres)
#   --retry       los devuelve a la cola (state=retry, +1 reintento permitido, como hace pg-boss al reintentar)
#   --discard     los borra de pgboss.job (el motivo se pierde: anótalo antes)
#   --queue N     solo la cola N (p. ej. study-pack);  --id U  solo ese trabajo (repetible)
#   --apply       ejecuta de verdad la acción; sin él (o con --dry-run) solo muestra qué haría
# Variables opcionales:
#   BACKUP_CONTAINER   contenedor de Postgres (lifeos-db-1); usa las variables POSTGRES_* del propio contenedor (sin contraseñas en el host)
# Antes de --retry de study-pack: comprueba que la IA local está encendida (bash scripts/ops/verify-hito-0.sh); si no, volverán a fallar.
# Códigos de salida: 0 = bien (o simulado); distinto de 0 = fallo o argumentos inválidos.
set -euo pipefail

CONTAINER="${BACKUP_CONTAINER:-lifeos-db-1}"
QUEUE=""; ACTION=""; APPLY=0; IDS=()
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
NAME_RE='^[A-Za-z0-9_.:-]{1,80}$'

die() { echo "error: $*" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --dry-run) APPLY=0 ;;
    --apply) APPLY=1 ;;
    --retry) [ -z "$ACTION" ] || die "elige --retry o --discard, no ambos"; ACTION=retry ;;
    --discard) [ -z "$ACTION" ] || die "elige --retry o --discard, no ambos"; ACTION=discard ;;
    --queue) [ $# -ge 2 ] || die "--queue necesita un nombre"; QUEUE="$2"; shift ;;
    --id) [ $# -ge 2 ] || die "--id necesita un UUID"; IDS+=("$2"); shift ;;
    *) die "opción desconocida: $1 (usa --help)" ;;
  esac
  shift
done
[ -z "$QUEUE" ] || [[ "$QUEUE" =~ $NAME_RE ]] || die "nombre de cola no válido"
for i in "${IDS[@]+"${IDS[@]}"}"; do [[ "$i" =~ $UUID_RE ]] || die "UUID no válido: $i"; done

# Filtro común (valores ya validados con lista blanca de caracteres).
WHERE="state = 'failed'"
[ -z "$QUEUE" ] || WHERE="$WHERE and name = '$QUEUE'"
if [ "${#IDS[@]}" -gt 0 ]; then
  list="$(printf "'%s'," "${IDS[@]}")"; WHERE="$WHERE and id in (${list%,})"
fi

psql_run() { docker exec -i "$CONTAINER" sh -c 'exec psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

echo "== Trabajos fallidos${QUEUE:+ de la cola $QUEUE} =="
psql_run <<SQL
select name as cola, id, retry_count || '/' || retry_limit as reintentos,
       to_char(created_on at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as creado,
       to_char(completed_on at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as fallo,
       left(coalesce(output::text, '(sin error registrado)'), 600) as error
from pgboss.job where $WHERE order by completed_on desc nulls last;
SQL

[ -n "$ACTION" ] || { echo "(solo lectura: añade --retry o --discard para actuar)"; exit 0; }

if [ "$ACTION" = retry ]; then
  SQL="update pgboss.job set state = 'retry', retry_limit = retry_limit + 1, completed_on = null, start_after = greatest(start_after, now()) where $WHERE;"
else
  SQL="delete from pgboss.job where $WHERE;"
fi

if [ "$APPLY" = 1 ]; then
  echo "== Ejecutando --$ACTION =="
  printf '%s\n' "$SQL" | psql_run
else
  echo "== SIMULACIÓN de --$ACTION (no se cambia nada; añade --apply para ejecutar) =="
  echo "$SQL"
fi
