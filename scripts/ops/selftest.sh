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
      *psql*) cat >> "\${FAKE_PSQL_IN:-/dev/null}"; [ -z "\${FAKE_PSQL_FAIL:-}" ] || exit 1; printf '%s' "\${FAKE_PSQL_OUT:-}" ;;
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

# ── harden-server.sh con sshd/systemctl/apt-get/tailscale/docker/ss SIMULADOS y raíz temporal ──
H="$HERE/harden-server.sh"; HB="$T/hbin"; mkdir -p "$HB"
bash -n "$H" && bash "$H" --help >>"$OUTALL" 2>&1 && ok "harden-server: sintaxis y --help"
cat > "$HB/sshd" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  -t) [ -z "${SSHD_FAIL:-}" ] ;;
  -T) echo "passwordauthentication ${SSHD_PW:-no}"; echo "kbdinteractiveauthentication no" ;;
esac
STUB
for c in systemctl apt-get unattended-upgrade; do printf '#!/usr/bin/env bash\necho "%s $*" >> "$HLOG"\n' "$c" > "$HB/$c"; done
printf '#!/usr/bin/env bash\n[ "$1" = ip ] && echo 100.64.0.5\n' > "$HB/tailscale"
cat > "$HB/ss" <<'STUB'
#!/usr/bin/env bash
cat <<'X'
Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0 128  0.0.0.0:22        0.0.0.0:*
tcp   LISTEN 0 4096 0.0.0.0:443       0.0.0.0:*
tcp   LISTEN 0 4096 0.0.0.0:81        0.0.0.0:*
tcp   LISTEN 0 4096 127.0.0.1:9443    0.0.0.0:*
X
STUB
cat > "$HB/docker" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  ps*) echo 'nginx-proxy-manager|jc21/nginx-proxy-manager:latest|0.0.0.0:81->81/tcp'
       echo 'portainer|portainer/portainer-ce:lts|0.0.0.0:9443->9443/tcp' ;;
  *compose.project.working_dir*) case "$*" in *nginx-proxy-manager) echo "${NPM_COMPOSE_DIR:-}" ;; esac ;;
  *Config.Image*) case "$*" in *portainer) echo portainer/portainer-ce:lts ;; *) echo jc21/nginx-proxy-manager:latest ;; esac ;;
  *Destination*) case "$*" in *'"/data"'*) echo /srv/datos ;; *letsencrypt*) echo /srv/le ;; esac ;;
  *Networks*) echo "bridge red_atlenza " ;;
esac
STUB
chmod +x "$HB"/*
export HLOG="$T/hlog"; : > "$HLOG"
HR="$T/hroot"; HH="$T/hhome"; mkdir -p "$HR/etc/ssh/sshd_config.d" "$HR/etc/apt/apt.conf.d" "$HH/.ssh"
chmod 755 "$HH"; chmod 700 "$HH/.ssh"
printf 'Include /etc/ssh/sshd_config.d/*.conf\n' > "$HR/etc/ssh/sshd_config"
printf 'ID=debian\nVERSION_CODENAME=trixie\n' > "$HR/etc/os-release"
HEXEC=(env PATH="$HB:$PATH" HARDEN_ROOT="$HR" HARDEN_HOME="$HH")
OUTD="$T/hout"; CONF="$HR/etc/ssh/sshd_config.d/99-hardening.conf"

"${HEXEC[@]}" bash "$H" --dry-run --out "$OUTD" >>"$OUTALL" 2>&1 && ok "harden --dry-run (sin llaves): exit 0"
"${HEXEC[@]}" bash "$H" --out "$OUTD" >>"$OUTALL" 2>&1 && ok "harden sin argumentos = simulación (exit 0)"
[ ! -e "$CONF" ] && [ ! -e "$OUTD" ] && [ ! -s "$HLOG" ] && ok "harden en seco no escribe ni ejecuta nada"
if "${HEXEC[@]}" bash "$H" --apply --yes --out "$OUTD" >>"$OUTALL" 2>&1; then bad "harden --apply aceptó authorized_keys inexistente"; else ok "harden --apply sin authorized_keys aborta"; fi
[ ! -e "$CONF" ] && [ ! -s "$HLOG" ] && ok "sin llaves: no hay 99-hardening.conf ni se ejecuta nada"

printf 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGVsZW1lbnRvRGVQcnVlYmFTZWxmdGVzdA test@selftest\n' > "$HH/.ssh/authorized_keys"
chmod 600 "$HH/.ssh/authorized_keys"
"${HEXEC[@]}" bash "$H" --dry-run --out "$OUTD" >"$T/seco.txt" 2>&1 && ok "harden --dry-run con llave: exit 0"
grep -q '100.64.0.5' "$T/seco.txt" && grep -q 'todas las interfaces' "$T/seco.txt" && ok "detecta Tailscale y marca el 81 como escucha en todas las interfaces"
grep -E 'TODAS las interfaces' "$T/seco.txt" | grep -q ':81' && ! grep -E 'TODAS las interfaces' "$T/seco.txt" | grep -qE ':(9443|443|22)\b' && ok "solo el 81 se marca (443, 22 y 9443 privado, no)"
[ ! -e "$CONF" ] && ok "dry-run con llave sigue sin escribir"

chmod 666 "$HH/.ssh/authorized_keys"
if "${HEXEC[@]}" bash "$H" --apply --yes --only ssh >>"$OUTALL" 2>&1; then bad "aceptó authorized_keys escribible por todos"; else ok "rechaza authorized_keys con permisos peligrosos (StrictModes)"; fi
chmod 600 "$HH/.ssh/authorized_keys"

if SSHD_FAIL=1 "${HEXEC[@]}" bash "$H" --apply --yes --only ssh >>"$OUTALL" 2>&1; then bad "no abortó con sshd -t fallando"; else ok "sshd -t falla: aborta"; fi
[ ! -e "$CONF" ] && ! grep -q reload "$HLOG" && ok "sshd -t falla: sin fichero y sin reload"
if SSHD_PW=yes "${HEXEC[@]}" bash "$H" --apply --yes --only ssh >>"$OUTALL" 2>&1; then bad "no detectó que otro fichero gana"; else ok "sshd -T aún permite contraseña: revierte"; fi
[ ! -e "$CONF" ] && ok "sshd -T: sin fichero tras revertir"

"${HEXEC[@]}" bash "$H" --apply --yes --out "$OUTD" >>"$OUTALL" 2>&1 && ok "harden --apply --yes (raíz temporal): exit 0"
grep -q '^PasswordAuthentication no' "$CONF" && grep -q 'reload ssh' "$HLOG" && ! grep -Eq 'restart|compose|stop|rm ' "$HLOG" && ok "SSH: fichero 99 + reload (nunca restart)"
grep -q 'install -y -q unattended-upgrades' "$HLOG" && grep -q 'Automatic-Reboot "false"' "$HR/etc/apt/apt.conf.d/52atlenza-unattended" && ok "unattended-upgrades instalado y sin reinicio automático"
[ "$(stat -c %a "$OUTD/.env")" = 600 ] && grep -q '^PANEL_BIND=100.64.0.5' "$OUTD/.env" && grep -q '^NPM_DATA=/srv/datos' "$OUTD/.env" && ok "plantillas y .env (600) con IP de Tailscale y datos detectados"
grep -q '0.0.0.0:80:80' "$OUTD/npm.compose.yml" && grep -q 'red_atlenza' "$OUTD/npm.compose.yml" && ok "NPM conserva la red de usuario y 80/443 públicos"
if grep -Eq '"0\.0\.0\.0:(81|9000|9443):' "$OUTD"/*.compose.yml; then bad "una plantilla publica un panel en 0.0.0.0"; else ok "ningún panel en 0.0.0.0 en las plantillas"; fi
# NPM con panel 81 en 127.0.0.1 (no depende de Tailscale) y plantilla coherente
grep -q 'NPM_ADMIN_BIND:-127.0.0.1}:81:81' "$OUTD/npm.compose.yml" && grep -q '^NPM_ADMIN_BIND=127.0.0.1' "$OUTD/.env" && ok "NPM: panel 81 a 127.0.0.1 por defecto"
# NPM y Portainer gestionados por compose: no se genera plantilla y se explica la edición
OUTC="$T/hout-compose"
NPM_COMPOSE_DIR=/home/x/reverse-proxy "${HEXEC[@]}" bash "$H" --apply --yes --only panels --out "$OUTC" >"$T/compose.txt" 2>&1 && ok "panels con NPM en compose: exit 0"
[ ! -e "$OUTC/npm.compose.yml" ] && [ -e "$OUTC/portainer.compose.yml" ] && ok "NPM en compose: sin plantilla de NPM (Portainer sí)"
grep -q '/home/x/reverse-proxy' "$T/compose.txt" && grep -q '127.0.0.1:81:81' "$T/compose.txt" && ok "NPM en compose: indica la carpeta y la edición del puerto"
# con sudo, lo generado queda a nombre del usuario
if [ "$(id -u)" = 0 ] && id nobody >/dev/null 2>&1; then
  OUTS="$T/hout-sudo"
  SUDO_USER=nobody "${HEXEC[@]}" bash "$H" --apply --yes --only panels --out "$OUTS" >>"$OUTALL" 2>&1
  [ "$(stat -c %U "$OUTS/.env")" = nobody ] && [ "$(stat -c %a "$OUTS/.env")" = 600 ] && ok "con sudo: el .env generado es del usuario (600)"
fi

# audit-server: INPUT=ACCEPT no es un firewall que filtre
AB="$T/abin"; mkdir -p "$AB"
printf '#!/bin/sh\necho "Status: inactive"\n' > "$AB/ufw"
printf '#!/bin/sh\nexit 1\n' > "$AB/firewall-cmd"
printf '#!/bin/sh\nprintf "table ip filter {\\n\\tchain DOCKER {\\n\\t\\tcounter accept\\n\\t}\\n\\tchain INPUT {\\n\\t\\ttype filter hook input priority filter; policy %%s;\\n\\t}\\n}\\n" "${AUDIT_NFT_POLICY:-accept}"\n' > "$AB/nft"
printf '#!/bin/sh\nprintf ":INPUT %%s [0:0]\\n:FORWARD DROP [0:0]\\n-A DOCKER -j ACCEPT\\n" "${AUDIT_NFT_POLICY:-ACCEPT}"\n' > "$AB/iptables-save"
chmod +x "$AB"/*
if [ "$(id -u)" = 0 ]; then
  PATH="$AB:$PATH" sh "$HERE/audit-server.sh" > "$T/aud1.md" 2>&1 || true
  if grep -q 'la entrada no se filtra' "$T/aud1.md" && ! grep -q 'Hay un firewall que filtra' "$T/aud1.md"; then ok "audit: INPUT=ACCEPT avisa en vez de dar ✅"; else bad "audit dio por bueno un firewall con INPUT=ACCEPT"; fi
  AUDIT_NFT_POLICY=drop PATH="$AB:$PATH" sh "$HERE/audit-server.sh" > "$T/aud2.md" 2>&1 || true
  if grep -q 'Hay un firewall que filtra la entrada' "$T/aud2.md"; then ok "audit: política INPUT=DROP sí cuenta como firewall"; else bad "audit no reconoce INPUT=DROP"; fi
fi

if "${HEXEC[@]}" bash "$H" --bind 0.0.0.0 >>"$OUTALL" 2>&1; then bad "aceptó --bind 0.0.0.0"; else ok "rechaza --bind 0.0.0.0"; fi

# ── check-backups.sh y el registro de backup-lifeos.sh (docker/crontab simulados) ──
CB="$HERE/check-backups.sh"; NOW="$(date +%s)"
bash -n "$CB" && bash "$CB" --help >>"$OUTALL" 2>&1 && ok "check-backups: sintaxis y --help"
bash -n "$HERE/../update.sh" && ok "update.sh: sintaxis"
# shellcheck disable=SC2016  # el stub se escribe tal cual, sin expandir
printf '#!/usr/bin/env bash\n[ -n "${FAKE_CRON:-}" ] && echo "30 3 * * * <RUTA>/scripts/ops/backup-lifeos.sh"\nexit 0\n' > "$T/bin/crontab"; chmod +x "$T/bin/crontab"
FAKE_CRON=1 FAKE_PSQL_OUT="$((NOW - 3600)) $((NOW - 3600)) true" bash "$CB" >"$T/cb1.txt" 2>&1 && grep -q 'Copias al día' "$T/cb1.txt" && ok "check-backups: cron + copia reciente → exit 0"
if FAKE_CRON=1 FAKE_PSQL_OUT="$((NOW - 3600)) $((NOW - 3600)) true" bash "$CB" 2>&1 | grep -q '⚠️'; then bad "aviso con las copias al día y cron"; fi
FAKE_CRON=1 FAKE_PSQL_OUT="$((NOW - 100 * 3600)) $((NOW - 100 * 3600)) true" bash "$CB" >"$T/cb2.txt" 2>&1 && bad "no avisó de una copia vieja" || grep -q 'más de 36 horas' "$T/cb2.txt" && ok "check-backups: copia vieja → aviso y exit 1"
FAKE_CRON=1 FAKE_PSQL_OUT="$((NOW - 7200)) $((NOW - 60)) false" bash "$CB" >"$T/cb3.txt" 2>&1 && bad "no avisó de la copia fallida" || grep -q 'última copia falló' "$T/cb3.txt" && ok "check-backups: última fallida → aviso"
FAKE_PSQL_OUT="0 0 " bash "$CB" >"$T/cb4.txt" 2>&1 && bad "no avisó sin copias" || grep -q 'no está activo' "$T/cb4.txt" && ok "check-backups: sin copias ni servicio → aviso de servicio inactivo"
FAKE_PSQL_FAIL=1 bash "$CB" >"$T/cb5.txt" 2>&1 && bad "no avisó con la BD ilegible" || grep -q 'No se pudo leer' "$T/cb5.txt" && ok "check-backups: BD ilegible → aviso"
# backup-lifeos.sh anota la ejecución
export FAKE_PSQL_IN="$T/psql-in.txt"; : > "$FAKE_PSQL_IN"
bash "$HERE/backup-lifeos.sh" >>"$OUTALL" 2>&1 && grep -q 'insert into "BackupRun"' "$FAKE_PSQL_IN" && grep -q ' true, ' "$FAKE_PSQL_IN" && ok "backup real anota BackupRun (ok)"
: > "$FAKE_PSQL_IN"; bash "$HERE/backup-lifeos.sh" --dry-run >>"$OUTALL" 2>&1; [ ! -s "$FAKE_PSQL_IN" ] && ok "backup --dry-run no anota nada"
unset FAKE_PSQL_IN

if grep -q "$FAKEPW" "$OUTALL"; then bad "aparece la contraseña ficticia en la salida"; fi
ok "sin secretos en la salida"
echo "Todo correcto."
