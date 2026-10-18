#!/usr/bin/env bash
# Endurece el servidor físico sin tocar Atlenza: SSH solo con llave, parches de seguridad desatendidos y paneles de gestión
# (Portainer 9000/9443, panel de Nginx Proxy Manager 81) fuera de Internet. Solo 80 y 443 quedan abiertos a 0.0.0.0.
# Por defecto es una SIMULACIÓN: no escribe, no instala ni recarga nada. Solo --apply cambia el sistema (tras avisos y confirmación).
# NUNCA reinicia servicios, ni recrea contenedores, ni toca lifeos-web / lifeos-db. Para los paneles solo genera ficheros
# (en --out) e imprime los comandos que tú lanzas a mano en una ventana tranquila: recrear NPM corta 80/443 unos segundos.
#
# Uso:   sudo bash scripts/ops/harden-server.sh [--dry-run] [--apply [--yes]] [--only ssh|updates|panels]...
#                                               [--user NOMBRE] [--bind IP] [--out DIR] [-h|--help]
#   --dry-run  (por defecto) muestra qué haría y el estado de puertos
#   --apply    aplica; exige root, avisa y pide escribir SI (--yes se salta solo la pregunta, no los avisos)
#   --only     limita a una parte (repetible). Sin él: ssh + updates + panels
#   --user     usuario cuyo ~/.ssh/authorized_keys se comprueba (por defecto SUDO_USER o el actual)
#   --bind     IP para los paneles (por defecto: IP de Tailscale detectada; si no hay, 127.0.0.1). Nunca 0.0.0.0
#   --out      carpeta de plantillas generadas para los paneles (por defecto ./hardening-out)
# Variables de prueba: HARDEN_ROOT (prefijo de /etc), HARDEN_HOME (home del usuario). No usar en producción.
# Código de salida: 0 = simulación o aplicación correcta; 1 = fallo o bloqueo en --apply; 2 = uso incorrecto.
set -euo pipefail
PATH="$PATH:/usr/sbin:/sbin"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${HARDEN_ROOT:-}"

APPLY=0; YES=0; ONLY=""; BIND=""; OUT="./hardening-out"; TUSER="${SUDO_USER:-$(id -un)}"
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; }
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --yes) YES=1 ;;
    --only) shift; [ $# -gt 0 ] || { echo "--only necesita un valor" >&2; exit 2; }
            case "$1" in ssh|updates|panels) ONLY="$ONLY $1" ;; *) echo "--only: ssh, updates o panels" >&2; exit 2 ;; esac ;;
    --user) shift; [ $# -gt 0 ] || { echo "--user necesita un valor" >&2; exit 2; }; TUSER="$1" ;;
    --bind) shift; [ $# -gt 0 ] || { echo "--bind necesita un valor" >&2; exit 2; }; BIND="$1" ;;
    --out) shift; [ $# -gt 0 ] || { echo "--out necesita un valor" >&2; exit 2; }; OUT="$1" ;;
    *) printf 'opción desconocida: %s (usa --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*"; }
die() { printf 'FALLO: %s\n' "$*" >&2; exit 1; }
BLOCKERS=0; FAIL=0
blocker() { BLOCKERS=$((BLOCKERS + 1)); printf 'BLOQUEO: %s\n' "$*"; }
want() { [ -z "$ONLY" ] || case " $ONLY " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# put RUTA MODO < contenido: escribe de forma atómica con --apply; en seco solo lo enseña
put() {
  if [ "$APPLY" = 1 ]; then
    mkdir -p "$(dirname "$1")"
    local tmp="$1.tmp.$$"
    ( umask 077; cat > "$tmp" )
    chmod "$2" "$tmp"; mv "$tmp" "$1"; say "escrito  $1 (modo $2)"
  else
    say "[seco] escribiría $1 (modo $2):"; sed 's/^/    | /'
  fi
}

if [ -n "$BIND" ]; then
  case "$BIND" in 0.0.0.0|::|'*') echo "--bind: no se admite $BIND (sería publicar el panel en Internet)" >&2; exit 2 ;; esac
  printf '%s' "$BIND" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || { echo "--bind: debe ser una IPv4" >&2; exit 2; }
fi

say "Modo: $([ "$APPLY" = 1 ] && echo APLICAR || echo 'SIMULACIÓN (usa --apply para cambiar algo)') · partes:${ONLY:- ssh updates panels}"

# ───────────────────────── SSH ─────────────────────────
SSH_OK=0
KEY_RE='(ssh-(rsa|ed25519)|ecdsa-sha2-nistp[0-9]+|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)[[:space:]]+[A-Za-z0-9+/=]{20,}'
ssh_preflight() {
  local home ak keys d mode
  say; say "== SSH: comprobaciones previas (usuario «$TUSER») =="
  if [ -n "${HARDEN_HOME:-}" ]; then home="$HARDEN_HOME"; else home="$(getent passwd "$TUSER" | cut -d: -f6 || true)"; fi
  if [ -z "$home" ] || [ ! -d "$home" ]; then blocker "no encuentro el home de «$TUSER» (usa --user)"; return 0; fi
  ak="$home/.ssh/authorized_keys"
  if [ ! -f "$ak" ]; then blocker "$ak no existe: con PasswordAuthentication no te quedarías fuera"; return 0; fi
  keys="$(grep -Ev '^[[:space:]]*(#|$)' "$ak" | grep -Ec "$KEY_RE" || true)"
  if [ "${keys:-0}" -lt 1 ]; then blocker "$ak no contiene ninguna clave pública válida"; return 0; fi
  say "ok  $ak: $keys clave(s) pública(s)"
  SSH_OK=1
  for d in "$home" "$home/.ssh" "$ak"; do
    mode="$(stat -c %a "$d")"
    if [ $((8#$mode & 022)) -ne 0 ]; then
      blocker "$d tiene modo $mode (escribible por grupo/otros): sshd (StrictModes) ignoraría tus llaves y te quedarías fuera"; SSH_OK=0
    fi
  done
  if ! grep -Eqi '^[[:space:]]*Include[[:space:]].*sshd_config\.d' "$ROOT/etc/ssh/sshd_config" 2>/dev/null; then
    blocker "$ROOT/etc/ssh/sshd_config no incluye sshd_config.d: el fichero 99 no tendría efecto"; SSH_OK=0
  fi
  command -v sshd >/dev/null 2>&1 || { blocker "no encuentro el binario sshd (no podría validar con sshd -t)"; SSH_OK=0; }
  # sshd aplica la PRIMERA coincidencia: un fichero anterior con «yes» ganaría al 99
  local hit
  hit="$(grep -rEil '^[[:space:]]*(PasswordAuthentication|KbdInteractiveAuthentication|ChallengeResponseAuthentication)[[:space:]]+yes' \
        "$ROOT/etc/ssh/sshd_config" "$ROOT/etc/ssh/sshd_config.d" 2>/dev/null | grep -v '99-hardening.conf' || true)"
  [ -z "$hit" ] || warn "estos ficheros activan autenticación por contraseña y pueden ganar al 99 (sshd usa la primera coincidencia): $(printf '%s' "$hit" | tr '\n' ' ')"
  if [ "$SSH_OK" = 1 ]; then say "ok  no hay bloqueos para SSH"; fi
  say "RECUERDA: comprueba que la llave de authorized_keys es la que usas de verdad (ssh -o PasswordAuthentication=no usuario@servidor desde OTRA terminal) antes de --apply."
}

ssh_apply() {
  say; say "== SSH: solo llave =="
  [ "$SSH_OK" = 1 ] || { say "omitido por bloqueos"; return 0; }
  local conf="$ROOT/etc/ssh/sshd_config.d/99-hardening.conf" bak="" eff k
  if [ "$APPLY" = 1 ] && [ -f "$conf" ]; then bak="$(mktemp)"; cp -p "$conf" "$bak"; fi
  put "$conf" 644 <<'EOF'
# Atlenza · endurecimiento de SSH (scripts/ops/harden-server.sh). Para deshacer: borrar este fichero y `systemctl reload ssh`.
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
EOF
  if [ "$APPLY" != 1 ]; then say "[seco] después: sshd -t · comprobar sshd -T · systemctl reload ssh (nunca restart)"; return 0; fi
  rollback() { if [ -n "$bak" ]; then cp -p "$bak" "$conf"; rm -f "$bak"; else rm -f "$conf"; fi; }
  if ! sshd -t; then rollback; die "sshd -t rechazó la configuración; revertido, SSH sin tocar"; fi
  eff="$(sshd -T 2>/dev/null || true)"
  for k in passwordauthentication kbdinteractiveauthentication; do
    printf '%s\n' "$eff" | grep -qi "^$k no\$" || { rollback; die "$k seguiría activo (otro fichero gana al 99); revertido, SSH sin tocar"; }
  done
  say "ok  sshd -t y sshd -T: contraseña desactivada"
  [ -z "$bak" ] || rm -f "$bak"
  if systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null; then say "ok  sshd recargado (las sesiones abiertas siguen vivas)"
  else FAIL=1; warn "no pude recargar sshd; la configuración en disco es válida, recarga a mano: systemctl reload ssh"; fi
  say "AHORA: no cierres esta sesión. Abre OTRA terminal y entra con tu llave; comprueba que la contraseña falla:"
  say "       ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password $TUSER@<servidor>   (debe dar «Permission denied»)"
}

# ───────────────────────── Parches ─────────────────────────
updates_apply() {
  local id cn
  say; say "== Parches de seguridad desatendidos =="
  id="$(grep -E '^ID=' "$ROOT/etc/os-release" 2>/dev/null | cut -d= -f2 | tr -d '"' || true)"
  cn="$(grep -E '^VERSION_CODENAME=' "$ROOT/etc/os-release" 2>/dev/null | cut -d= -f2 | tr -d '"' || true)"
  if [ "$id" != debian ] || [ "$cn" != trixie ]; then
    warn "esto no es Debian trixie (${id:-?}/${cn:-?}): el origen «Debian-Security» de la plantilla puede no existir aquí"
  fi
  if [ "$APPLY" = 1 ]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q unattended-upgrades apt-listchanges || die "apt-get install falló"
  else
    say "[seco] ejecutaría: apt-get install -y unattended-upgrades apt-listchanges"
  fi
  put "$ROOT/etc/apt/apt.conf.d/20auto-upgrades" 644 <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  # Añade Debian-Security a lo que Debian ya permite por defecto (también las actualizaciones normales de la rama estable); no toca repos de terceros ni la app.
  # Sin reinicio automático: un reinicio del host reiniciaría Atlenza; los reinicios los decides tú.
  put "$ROOT/etc/apt/apt.conf.d/52atlenza-unattended" 644 <<'EOF'
Unattended-Upgrade::Origins-Pattern {
  "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "false";
EOF
  if [ "$APPLY" = 1 ]; then
    systemctl enable --now apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || warn "no pude activar los temporizadores de apt (revisa systemctl list-timers)"
    unattended-upgrade --dry-run >/dev/null 2>&1 && say "ok  unattended-upgrade --dry-run" || { FAIL=1; warn "unattended-upgrade --dry-run falló: revisa /var/log/unattended-upgrades/"; }
  else
    say "[seco] después: systemctl enable --now apt-daily.timer apt-daily-upgrade.timer · unattended-upgrade --dry-run"
  fi
  if dpkg -s needrestart >/dev/null 2>&1; then
    warn "needrestart está instalado: tras un parche puede reiniciar servicios (incluido docker). Pon «\$nrconf{restart} = 'l';» en /etc/needrestart/conf.d/ para que solo avise."
  fi
}

# ───────────────────────── Paneles ─────────────────────────
mount_src() { docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}" "$1" 2>/dev/null || true; }
image_of() { docker inspect -f '{{.Config.Image}}' "$1" 2>/dev/null || true; }
compose_dir_of() { docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$1" 2>/dev/null || true; }
nets_of() { docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1" 2>/dev/null || true; }

# network_block CONTENEDOR: texto YAML para conservar las redes de usuario del contenedor actual (la app puede depender de ellas)
network_block() {
  local n list=""
  for n in $(nets_of "$1"); do case "$n" in bridge|host|none) ;; *) list="$list $n" ;; esac; done
  [ -n "$list" ] || return 0
  printf '    networks:\n'; for n in $list; do printf '      - %s\n' "$n"; done
  printf 'networks:\n'; for n in $list; do printf '  %s:\n    external: true\n' "$n"; done
}

panels_apply() {
  local ts="" pc="" nc="" pcdir="" ncdir="" ports="" envf="" v net created_out=0
  say; say "== Paneles de gestión =="
  if [ -n "$BIND" ]; then ts="$BIND"; say "interfaz forzada con --bind: $ts"
  else
    if command -v tailscale >/dev/null 2>&1; then ts="$(tailscale ip -4 2>/dev/null | head -n1 || true)"; fi
    if [ -z "$ts" ] && command -v ip >/dev/null 2>&1; then
      ts="$(ip -4 -o addr show dev tailscale0 2>/dev/null | awk '{sub(/\/.*/,"",$4); print $4; exit}' || true)"
    fi
    if [ -n "$ts" ]; then say "Tailscale detectado: $ts (los paneles solo serán alcanzables desde tu tailnet)"
    else ts="127.0.0.1"; say "Sin Tailscale: los paneles quedan en 127.0.0.1 (acceso con túnel: ssh -L 9443:127.0.0.1:9443 usuario@servidor)"; fi
  fi
  if command -v docker >/dev/null 2>&1; then
    ports="$(docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null || true)"
    pc="$(printf '%s\n' "$ports" | grep -Ei 'portainer' | head -n1 | cut -d'|' -f1 || true)"
    nc="$(printf '%s\n' "$ports" | grep -Ei 'nginx-proxy-manager|jc21' | head -n1 | cut -d'|' -f1 || true)"
    [ -z "$pc" ] || pcdir="$(compose_dir_of "$pc")"
    [ -z "$nc" ] || ncdir="$(compose_dir_of "$nc")"
    say "Contenedores de gestión detectados (solo lectura):"
    printf '%s\n' "$ports" | grep -Ei 'portainer|nginx-proxy-manager|jc21' | sed 's/^/    /' || say "    (ninguno)"
    if [ -n "$nc" ] && docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$nc" 2>/dev/null | grep -q '^DB_MYSQL_HOST'; then
      warn "$nc usa MariaDB/MySQL (DB_MYSQL_*): la plantilla NO copia ese entorno. Edita el puerto en SU compose original en vez de recrear con la plantilla."
    fi
  else
    warn "docker no está disponible aquí: se generan plantillas sin datos detectados (rellena el .env a mano)"
  fi

  # .env: valores detectados; lo no detectado queda comentado y la plantilla se negará a arrancar sin definirlo
  envf="$({
    printf '# Generado por harden-server.sh. PANEL_BIND: IP donde escuchan los paneles (nunca 0.0.0.0).\nPANEL_BIND=%s\n' "$ts"
    printf '# NPM_ADMIN_BIND: panel 81 de NPM. Siempre 127.0.0.1 (existe en el arranque); NPM es la puerta pública de Atlenza y no debe depender de Tailscale.\nNPM_ADMIN_BIND=127.0.0.1\n'
    if [ -n "$pc" ]; then
      printf 'PORTAINER_CONTAINER=%s\nPORTAINER_IMAGE=%s\n' "$pc" "$(image_of "$pc")"
      v="$(mount_src "$pc" /data)"; [ -n "$v" ] && printf 'PORTAINER_DATA=%s\n' "$v" || printf '# PORTAINER_DATA=  (no detectado: ruta del volumen /data)\n'
    else printf '# PORTAINER_DATA=  (Portainer no detectado: define la ruta del volumen /data)\n'; fi
    if [ -n "$nc" ]; then
      printf 'NPM_CONTAINER=%s\nNPM_IMAGE=%s\n' "$nc" "$(image_of "$nc")"
      v="$(mount_src "$nc" /data)"; [ -n "$v" ] && printf 'NPM_DATA=%s\n' "$v" || printf '# NPM_DATA=  (no detectado)\n'
      v="$(mount_src "$nc" /etc/letsencrypt)"; [ -n "$v" ] && printf 'NPM_LETSENCRYPT=%s\n' "$v" || printf '# NPM_LETSENCRYPT=  (no detectado)\n'
    else printf '# NPM_DATA= y NPM_LETSENCRYPT=  (NPM no detectado: define las rutas de /data y /etc/letsencrypt)\n'; fi
  })"
  [ -d "$OUT" ] || created_out=1
  printf '%s\n' "$envf" | put "$OUT/.env" 600
  for net in portainer npm; do
    if [ "$net" = portainer ] && [ -n "$pcdir" ]; then say "Portainer vive en un compose ($pcdir): no se genera plantilla, se edita ese fichero."; continue; fi
    if [ "$net" = npm ] && [ -n "$ncdir" ]; then say "NPM vive en un compose ($ncdir): no se genera plantilla, se edita ese fichero."; continue; fi
    { cat "$HERE/templates/$net.compose.yml"
      if [ "$net" = portainer ] && [ -n "$pc" ]; then network_block "$pc"; fi
      if [ "$net" = npm ] && [ -n "$nc" ]; then network_block "$nc"; fi
    } | put "$OUT/$net.compose.yml" 644
  done
  # con sudo, lo generado debe seguir siendo del usuario (un .env de root con modo 600 no lo lee docker compose)
  if [ "$APPLY" = 1 ] && [ -n "${SUDO_USER:-}" ] && [ "$(id -u)" = 0 ]; then
    for v in .env portainer.compose.yml npm.compose.yml; do
      [ ! -e "$OUT/$v" ] || chown "$SUDO_USER:" "$OUT/$v" 2>/dev/null || warn "no pude dejar $OUT/$v a nombre de $SUDO_USER"
    done
    [ "$created_out" = 0 ] || chown "$SUDO_USER:" "$OUT" 2>/dev/null || true
  fi

  say; say "Para cerrar los paneles (lo haces tú, en una ventana tranquila; el script NO lo ejecuta):"
  say "  1) Guarda cómo corren hoy:  docker inspect ${pc:-portainer} ${nc:-nginx-proxy-manager} > ~/paneles-antes.json && chmod 600 ~/paneles-antes.json   (contiene variables de entorno: no lo subas a ningún sitio)"
  if [ -n "$nc" ] && [ -n "$ncdir" ]; then
    say "  2) NPM (compose en $ncdir; CORTA 80/443 unos segundos, Atlenza no responde en ese tiempo):"
    say "       cd $ncdir && cp docker-compose.yml docker-compose.yml.bak   (copia también data y letsencrypt si no tienes otra)"
    say "       edita el puerto del panel: \"81:81\" → \"127.0.0.1:81:81\" (80 y 443 no se tocan; si ves un rango tipo 80-81:80-81, sepáralo)"
    say "       p. ej. sed -i \"s/- '81:81'/- '127.0.0.1:81:81'/\" docker-compose.yml  ·  diff docker-compose.yml.bak docker-compose.yml  ·  docker compose config -q"
    say "       aplicar: docker compose up -d     deshacer: cp docker-compose.yml.bak docker-compose.yml && docker compose up -d"
  elif [ -n "$nc" ]; then
    say "  2) NPM (CORTA 80/443 unos segundos, Atlenza no responde en ese tiempo):  docker stop $nc && docker rm $nc && docker compose -f $OUT/npm.compose.yml --env-file $OUT/.env up -d"
  fi
  if [ -n "$pc" ] && [ -n "$pcdir" ]; then
    say "  3) Portainer (compose en $pcdir): cambia ahí \"9000:9000\" y \"9443:9443\" por \"$ts:9000:9000\" y \"$ts:9443:9443\" y haz docker compose up -d."
  elif [ -n "$pc" ]; then
    say "  3) Portainer (sin efecto sobre Atlenza):  docker stop $pc && docker rm $pc && docker compose -f $OUT/portainer.compose.yml --env-file $OUT/.env up -d"
  fi
  say "  4) Comprueba:  ss -tulpn | grep -E ':(81|9000|9443)\\b'   → 81 solo en 127.0.0.1; 9000/9443 solo en $ts (o 127.0.0.1); nunca 0.0.0.0, [::] ni *"
  say "     El panel de NPM se abre con un túnel:  ssh -L 8081:127.0.0.1:81 usuario@servidor  →  http://localhost:8081"
  say "     (el 81 va a 127.0.0.1 y no a Tailscale a propósito: si Docker arrancara antes que Tailscale, NPM no levantaría y Atlenza quedaría caído)"
  say "  5) Portainer sí va a $ts: si no arranca tras un reinicio, solo cae Portainer. Ver docs/servidor-hardening.md § «Tailscale y el orden de arranque»."
}

# ───────────────────────── Informe de puertos ─────────────────────────
ports_report() {
  say; say "== Puertos de interés (ss -tulpn) =="
  if ! command -v ss >/dev/null 2>&1; then warn "ss no está disponible"; return 0; fi
  ss -tulpn 2>/dev/null | awk '
    ($1=="tcp"||$1=="udp") {
      n=split($5,a,":"); port=a[n]; host=substr($5,1,length($5)-length(port)-1)
      if (port!~/^(22|80|81|443|9000|9443)$/) next
      pub=(host=="0.0.0.0"||host=="*"||host=="[::]"||host=="::")
      if (pub && port!~/^(22|80|443)$/) tag="⚠️  escucha en TODAS las interfaces (red local; Internet solo si el router lo reenvía o hay IPv6 público)"
      else if (pub && port=="22") tag="público (SSH, esperado)"
      else if (pub) tag="público (web, esperado)"
      else tag="privado (" host ")"
      printf "  %-4s %-22s %s\n", $1, $5, tag }' || true
  say "  (¡Docker publica con sus propias reglas de iptables y SALTA ufw: lo que escucha aquí en todas las interfaces lo ve tu red aunque ufw diga lo contrario! Para saber si llega a Internet mira el reenvío de puertos de tu router y si tienes IPv6 público.)"
}

# ───────────────────────── Principal ─────────────────────────
want ssh && ssh_preflight
if [ "$APPLY" = 1 ]; then
  if want ssh || want updates; then [ -n "$ROOT" ] || [ "$(id -u)" = 0 ] || die "--apply necesita root (usa sudo)"; fi
  if want ssh && [ "$SSH_OK" != 1 ]; then die "hay bloqueos de SSH (arriba); no se ha cambiado nada"; fi
  cat <<'EOF'

=== AVISOS DE SEGURIDAD ===
 • Mantén abierta una sesión SSH que ya funcione mientras dura esto, y ten a mano la consola web del proveedor o teclado físico.
 • Desactivar la contraseña sin una llave que funcione te deja fuera del servidor.
 • Los paneles NO se recrean aquí: solo se generan ficheros. Recrear NPM corta 80/443 unos segundos.
 • No se tocan lifeos-web ni lifeos-db, ni se reinicia ningún servicio de la app.
EOF
  if [ "$YES" != 1 ]; then
    printf 'Escribe SI para continuar: '; ans=""; read -r ans || true
    [ "$ans" = SI ] || die "cancelado, no se ha cambiado nada"
  fi
fi

want ssh && ssh_apply
want updates && updates_apply
want panels && panels_apply
ports_report

say
if [ "$APPLY" = 1 ]; then
  if [ "$FAIL" = 0 ]; then say "Hecho. Sigue el protocolo de verificación de docs/servidor-hardening.md."; else say "Terminado con avisos (arriba)."; fi
  exit "$FAIL"
fi
say "Simulación terminada: bloqueos detectados: $BLOCKERS. Nada se ha modificado. Revisa y repite con --apply."
