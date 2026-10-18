#!/usr/bin/env bash
# Prueba de los scripts de scripts/ops con un `docker` SIMULADO: no necesita Docker, ni Postgres, ni toca nada fuera de un directorio temporal.
# Uso: bash scripts/ops/selftest.sh   (código 0 = todo bien)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAKEPW="s3cr3t-NO-DEBE-SALIR"
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<STUB
#!/usr/bin/env bash
# docker simulado
case "\$1" in
  inspect) echo true ;;
  exec)
    last="\${*: -1}"
    case "\$last" in
      *pg_dump*) printf -- '--\n-- PostgreSQL database dump\n--\nCREATE TABLE public._prisma_migrations (id text);\nCREATE TABLE public."User" (id text);\n-- PostgreSQL database dump complete\n' ;;
      *POSTGRES_DB\"\ *|*printf*) printf lifeos ;;
      *count*) echo 2 ;;
      *) case " $* " in *" -i "*) cat >/dev/null ;; esac ;;
    esac ;;
esac
# la contraseña ficticia solo existe aquí dentro, jamás se imprime
: "$FAKEPW"
STUB
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH"
export BACKUP_DIR="$T/backups"
ok() { printf 'OK   %s\n' "$1"; }
bad() { printf 'FALLA %s\n' "$1" >&2; exit 1; }
OUTALL="$T/out.txt"; : > "$OUTALL"

for s in backup-lifeos verify-backup secure-env-permissions; do
  bash -n "$HERE/$s.sh" && bash "$HERE/$s.sh" --help >>"$OUTALL" 2>&1 && ok "$s: sintaxis y --help"
done

bash "$HERE/backup-lifeos.sh" --dry-run >>"$OUTALL" 2>&1 && ok "backup --dry-run"
[ ! -e "$BACKUP_DIR" ] || bad "el dry-run creó el destino"

# copia vieja que debe rotar y una reciente que debe quedar
mkdir -p "$BACKUP_DIR"; : > "$BACKUP_DIR/lifeos-db-VIEJA.sql.gz"; touch -d '20 days ago' "$BACKUP_DIR/lifeos-db-VIEJA.sql.gz"
bash "$HERE/backup-lifeos.sh" >>"$OUTALL" 2>&1 && ok "backup real (exit 0)"
NEW="$(ls "$BACKUP_DIR"/lifeos-db-2*.sql.gz)"
[ -f "$NEW.sha256" ] && ( cd "$BACKUP_DIR" && sha256sum -c --status "$(basename "$NEW").sha256" ) && ok "sha256 válido"
[ "$(stat -c %a "$NEW")" = 600 ] && [ "$(stat -c %a "$BACKUP_DIR")" = 700 ] && ok "permisos 600/700"
[ ! -e "$BACKUP_DIR/lifeos-db-VIEJA.sql.gz" ] && ok "rotación borra >14 días"

bash "$HERE/verify-backup.sh" "$NEW" >>"$OUTALL" 2>&1 && ok "verify (copia buena)"
bash "$HERE/verify-backup.sh" --restore-test >>"$OUTALL" 2>&1 && ok "verify --restore-test (docker simulado)"
bash "$HERE/verify-backup.sh" --dry-run >>"$OUTALL" 2>&1 && ok "verify --dry-run"
printf 'X' >> "$NEW"
if bash "$HERE/verify-backup.sh" "$NEW" >>"$OUTALL" 2>&1; then bad "verify aceptó una copia corrupta"; else ok "verify rechaza copia corrupta"; fi

mkdir -p "$T/srv/app/node_modules/x" "$T/srv/app"
printf 'A=1\n' > "$T/srv/app/.env.production"; printf 'B=2\n' > "$T/srv/app/.env.local"; printf 'C=3\n' > "$T/srv/app/.env.example"
printf 'D=4\n' > "$T/srv/app/node_modules/x/.env"
chmod 644 "$T/srv/app/.env.production" "$T/srv/app/.env.example" "$T/srv/app/node_modules/x/.env"; chmod 600 "$T/srv/app/.env.local"
bash "$HERE/secure-env-permissions.sh" "$T/srv" >>"$OUTALL" 2>&1
[ "$(stat -c %a "$T/srv/app/.env.production")" = 644 ] && ok "secure-env en seco no cambia nada"
bash "$HERE/secure-env-permissions.sh" --apply "$T/srv" >>"$OUTALL" 2>&1
[ "$(stat -c %a "$T/srv/app/.env.production")" = 600 ] && [ "$(stat -c %a "$T/srv/app/.env.example")" = 644 ] \
  && [ "$(stat -c %a "$T/srv/app/node_modules/x/.env")" = 644 ] && ok "--apply: 600, respeta .env.example y node_modules"
[ "$(cat "$T/srv/app/.env.production")" = "A=1" ] && ok "contenido intacto"

if grep -q "$FAKEPW" "$OUTALL"; then bad "aparece la contraseña ficticia en la salida"; fi
ok "sin secretos en la salida"
echo "Todo correcto."
