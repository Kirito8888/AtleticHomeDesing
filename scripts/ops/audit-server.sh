#!/bin/sh
# Auditoría global de un servidor Linux físico: SOLO LECTURA, pasiva, sin red saliente.
# Escribe un informe en Markdown por la salida estándar; no crea ficheros, no instala, no reinicia ni cambia nada.
# Los secretos no se leen (no se abre ningún .env, clave ni certificado) y lo que salga se pasa por un filtro:
# IPs públicas, MAC, variables sensibles, credenciales en URL y bloques largos tipo clave quedan enmascarados.
#
# Uso:   sh scripts/ops/audit-server.sh > auditoria.md          (usuario normal: informe parcial)
#        sudo sh scripts/ops/audit-server.sh > auditoria.md     (root: informe completo)
# Variables opcionales:  AUDIT_HIDE_HOST=1 (oculta el nombre del equipo) · AUDIT_DISK_WARN=85 (% de disco que avisa)
#                        AUDIT_TIMEOUT=20 (segundos máximos por comando)
# Termina siempre con código 0: lo que no se pueda leer se anota en el informe.
set -u
LC_ALL=C; export LC_ALL
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"; export PATH

DISK_WARN="${AUDIT_DISK_WARN:-85}"
TMO="${AUDIT_TIMEOUT:-20}"
IS_ROOT=0; [ "$(id -u 2>/dev/null)" = 0 ] && IS_ROOT=1
FIND=""

has() { command -v "$1" >/dev/null 2>&1; }
tmo() { if has timeout; then timeout "$TMO" "$@"; else "$@"; fi; }
warn() { FIND="$FIND- ⚠️ $1
"; }
h2() { printf '\n## %s\n' "$1"; }
h3() { printf '\n### %s\n\n' "$1"; }
open() { printf '```\n'; }
close() { printf '```\n'; }
# Ejecuta un comando externo dentro de un bloque de código; si no existe, lo dice.
show() {
  if has "$1"; then open; tmo "$@" 2>&1; close; else printf '_No disponible: `%s`._\n' "$1"; fi
}

# ---------------------------------------------------------------- filtro de anonimizado
sanitize() {
  W='[Kk][Ee][Yy]|[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Pp][Aa][Ss][Ss]|[Pp][Ww][Dd]|[Cc][Rr][Ee][Dd]|[Aa][Uu][Tt][Hh]|[Dd][Ss][Nn]|[Dd][Aa][Tt][Aa][Bb][Aa][Ss][Ee]_?[Uu][Rr][Ll]'
  HOSTRE=''
  if [ "${AUDIT_HIDE_HOST:-0}" = 1 ]; then HOSTRE="$(hostname 2>/dev/null | sed 's/[^A-Za-z0-9-]/./g')"; fi
  sed -E \
    -e "s/BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)[A-Z ]*/[oculto]/g" \
    -e "s#(\"[A-Za-z0-9_.-]*($W)[A-Za-z0-9_.-]*\"[ ]*:[ ]*)\"[^\"]*\"#\\1\"***\"#g" \
    -e "s#([A-Za-z0-9_.-]*($W)[A-Za-z0-9_.-]*)[ ]*=[ ]*(\"[^\"]*\"|'[^']*'|[^ \"'&]+)#\\1=***#g" \
    -e "s#(--[A-Za-z0-9-]*($W)[A-Za-z0-9-]*)[ ]+[^ -][^ ]*#\\1 ***#g" \
    -e 's#(://)[^/@ ]+@#\1***@#g' \
    -e 's/[A-Za-z0-9+\/=_-]{60,}/[oculto]/g' \
    -e 's/([0-9A-Fa-f]{2}:){3}([0-9A-Fa-f]{2}:){2}[0-9A-Fa-f]{2}/xx:xx:xx:xx:xx:xx/g' |
  { if [ -n "$HOSTRE" ]; then sed "s/$HOSTRE/<equipo>/g"; else cat; fi; } |
  awk '
    function keep(o1, o2) {
      return (o1==10 || o1==127 || o1==0 || o1>=224 || (o1==192 && o2==168) || (o1==172 && o2>=16 && o2<=31) || (o1==169 && o2==254) || (o1==100 && o2>=64 && o2<=127))
    }
    {
      line=$0; out=""
      while (match(line, /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) {
        pre=substr(line,1,RSTART-1); tok=substr(line,RSTART,RLENGTH); line=substr(line,RSTART+RLENGTH)
        prev=substr(pre,length(pre),1)
        split(tok,o,".")
        if (o[1]<=255 && o[2]<=255 && o[3]<=255 && o[4]<=255 && prev !~ /[A-Za-z_.-]/ && line !~ /^\.[0-9]/ && !keep(o[1]+0,o[2]+0)) tok=o[1] "." o[2] ".x.x"
        out=out pre tok
      }
      line=out line; out=""
      while (match(line, /[0-9A-Fa-f:]*:[0-9A-Fa-f:]*:[0-9A-Fa-f:]+/)) {
        pre=substr(line,1,RSTART-1); tok=substr(line,RSTART,RLENGTH); line=substr(line,RSTART+RLENGTH)
        t=tok; c=gsub(/:/,":",t)
        if ((index(tok,"::")>0 || c>=7) && tok !~ /^::/ && tok !~ /^[fF][eE]80/ && tok !~ /^[fF][cCdD]/ && tok !~ /^[fF][fF]0/) {
          split(tok,g,":"); tok=g[1] "::x"
        }
        out=out pre tok
      }
      print out line
    }'
}

# ---------------------------------------------------------------- secciones
cabecera() {
  HN="$(hostname 2>/dev/null || echo desconocido)"
  [ "${AUDIT_HIDE_HOST:-0}" = 1 ] && HN="(oculto)"
  printf '# Auditoría del servidor\n\n'
  printf -- '- **Fecha (UTC):** %s\n' "$(date -u '+%Y-%m-%d %H:%M' 2>/dev/null)"
  printf -- '- **Equipo:** %s\n' "$HN"
  printf -- '- **Usuario que ejecuta:** %s (%s)\n' "$(id -un 2>/dev/null)" "$([ $IS_ROOT = 1 ] && echo 'root: informe completo' || echo 'sin root: informe parcial')"
  printf -- '- **Modo:** solo lectura. No se abre ningún `.env`, clave privada ni certificado.\n'
  printf '\n> Aviso: aunque está anonimizado, el informe describe la superficie de ataque del servidor. Guárdalo con `chmod 600`, revísalo antes de compartirlo y no lo subas a un repositorio.\n'
  if [ $IS_ROOT = 0 ]; then
    printf '\n> Sin root no se ven: reglas del firewall, configuración efectiva de SSH, procesos de otros usuarios en `ss`, crontabs de otros usuarios ni contraseñas vacías. Repite con `sudo` para el informe completo.\n'
  fi
}

host() {
  h2 '1. Hardware y recursos'
  h3 'Sistema'
  open
  if [ -r /etc/os-release ]; then grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release | tr -d '"'; fi
  printf 'Kernel: %s\n' "$(uname -sr 2>/dev/null)"
  printf 'Arquitectura: %s\n' "$(uname -m 2>/dev/null)"
  printf 'Uptime: %s\n' "$(uptime -p 2>/dev/null || uptime 2>/dev/null)"
  printf 'Carga (1/5/15 min): %s\n' "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
  close
  h3 'CPU'
  open
  printf 'Núcleos: %s\n' "$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null)"
  grep -m1 'model name' /proc/cpuinfo 2>/dev/null
  close
  h3 'Memoria y swap'
  open
  if has free; then free -h 2>&1; else grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree)' /proc/meminfo 2>&1; fi
  close
  SW="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null)"
  [ "${SW:-1}" = 0 ] && warn 'Sin swap configurada: un pico de memoria puede acabar en el OOM-killer.'
  MEMPCT="$(awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END {if (t>0) printf "%d", (t-a)*100/t}' /proc/meminfo 2>/dev/null)"
  [ "${MEMPCT:-0}" -ge 90 ] 2>/dev/null && warn "Memoria en uso al ${MEMPCT} %."
  h3 'Discos y particiones'
  open
  df -hT -x tmpfs -x devtmpfs 2>/dev/null || df -h 2>&1
  close
  if has lsblk; then h3 'Dispositivos de bloque'; show lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT; fi
  FULL="$(df -P 2>/dev/null | awk -v t="$DISK_WARN" 'NR>1 && $1 ~ /^\// && $5+0 >= t {printf "%s (%s) ", $6, $5}')"
  [ -n "$FULL" ] && warn "Disco por encima del ${DISK_WARN} %: $FULL"
  h3 'Procesos que más memoria usan (solo nombre, sin argumentos)'
  open; tmo ps -eo user,pid,pcpu,pmem,comm --sort=-pmem 2>&1 | head -11; close
}

ssh_audit() {
  h3 'SSH'
  SSHD_T=""
  if [ $IS_ROOT = 1 ] && has sshd; then SSHD_T="$(tmo sshd -T 2>/dev/null)"; fi
  if [ -n "$SSHD_T" ]; then
    printf 'Fuente: `sshd -T` (configuración efectiva).\n\n'
  elif [ -r /etc/ssh/sshd_config ]; then
    printf 'Fuente: ficheros de `/etc/ssh` (primera coincidencia; puede no ser la efectiva si hay `Match`).\n\n'
  else
    printf '_No hay `sshd_config` legible: SSH no instalado o sin permisos._\n'; return
  fi
  sshval() {
    if [ -n "$SSHD_T" ]; then
      printf '%s\n' "$SSHD_T" | awk -v k="$1" '$1==k {print $2; exit}'
    else
      grep -ihEs "^[[:space:]]*$1[[:space:]=]" /etc/ssh/sshd_config.d/*.conf /etc/ssh/sshd_config 2>/dev/null | head -1 | awk '{print $2}'
    fi | tr 'A-Z' 'a-z'
  }
  printf '| Parámetro | Valor | Valoración |\n|---|---|---|\n'
  v="$(sshval permitrootlogin)"; d=''
  [ -z "$v" ] && v='prohibit-password' && d=' (por defecto)'
  case "$v" in yes) r='⚠️ root entra por SSH con contraseña'; warn 'SSH: `PermitRootLogin yes`.';; no) r='✅';; *) r='✅ solo con clave';; esac
  printf '| PermitRootLogin | %s%s | %s |\n' "$v" "$d" "$r"
  v="$(sshval passwordauthentication)"; d=''
  [ -z "$v" ] && v='yes' && d=' (por defecto)'
  case "$v" in no) r='✅';; *) r='⚠️ contraseñas aceptadas (fuerza bruta)'; warn 'SSH: `PasswordAuthentication` activo; usar solo claves.';; esac
  printf '| PasswordAuthentication | %s%s | %s |\n' "$v" "$d" "$r"
  v="$(sshval port)"; d=''
  [ -z "$v" ] && v='22' && d=' (por defecto)'
  printf '| Port | %s%s | %s |\n' "$v" "$d" "$([ "$v" = 22 ] && echo 'estándar (ruido de escáneres; no es un fallo)' || echo 'no estándar')"
  v="$(sshval pubkeyauthentication)"; printf '| PubkeyAuthentication | %s | %s |\n' "${v:-yes (por defecto)}" "$([ "$v" = no ] && echo '⚠️ sin claves públicas' || echo '✅')"
  v="$(sshval kbdinteractiveauthentication)"; [ -z "$v" ] && v="$(sshval challengeresponseauthentication)"
  printf '| KbdInteractiveAuthentication | %s | %s |\n' "${v:-(no definido)}" "$([ "$v" = yes ] && echo '⚠️ otro canal de contraseña' || echo '✅')"
  v="$(sshval maxauthtries)"; printf '| MaxAuthTries | %s | |\n' "${v:-6 (por defecto)}"
  v="$(sshval permitemptypasswords)"; printf '| PermitEmptyPasswords | %s | %s |\n' "${v:-no (por defecto)}" "$([ "$v" = yes ] && echo '⚠️' || echo '✅')"
  [ "$v" = yes ] && warn 'SSH: `PermitEmptyPasswords yes`.'
  printf '\nPermisos de claves SSH (solo rutas; no se abre ningún fichero):\n\n'
  open
  HOMES="$HOME"; [ $IS_ROOT = 1 ] && HOMES="/root $(ls -d /home/*/ 2>/dev/null | sed 's#/$##')"
  for hd in $HOMES; do
    [ -d "$hd/.ssh" ] || continue
    printf '%s/.ssh:\n' "$hd"; ls -l "$hd/.ssh" 2>&1 | sed 1d | awk '{print "  " $1, $3, $NF}'
    BAD="$(find "$hd/.ssh" -maxdepth 1 -type f -name 'id_*' ! -name '*.pub' -perm /077 2>/dev/null)"
    [ -n "$BAD" ] && warn "Clave privada SSH con permisos demasiado abiertos en $hd/.ssh (debe ser 600)."
  done
  close
}

firewall_audit() {
  h3 'Firewall'
  FW=""
  if has ufw && [ $IS_ROOT = 1 ]; then
    U="$(tmo ufw status verbose 2>&1)"; open; printf '%s\n' "$U"; close
    case "$U" in *"Status: active"*) FW=1;; *) FW=0;; esac
  fi
  if has nft && [ $IS_ROOT = 1 ]; then
    N="$(tmo nft list ruleset 2>/dev/null)"
    NR="$(printf '%s\n' "$N" | grep -cE '^[[:space:]]+(ip|ip6|iifname|oifname|tcp|udp|meta|ct|counter|jump|accept|drop|reject)' )"
    printf 'nftables: %s tabla(s), ~%s regla(s).\n' "$(printf '%s\n' "$N" | grep -c '^table')" "$NR"
    [ "$NR" -gt 0 ] && [ -z "$FW" ] && FW=1
  fi
  if has iptables-save && [ $IS_ROOT = 1 ]; then
    I="$(tmo iptables-save 2>/dev/null)"
    IR="$(printf '%s\n' "$I" | grep -c '^-A')"
    printf 'iptables: %s regla(s). Políticas: %s\n' "$IR" "$(printf '%s\n' "$I" | grep -E '^:(INPUT|FORWARD) ' | awk '{printf "%s=%s ", substr($1,2), $2}')"
    [ "$IR" -gt 0 ] && [ -z "$FW" ] && FW=1
  fi
  if has firewall-cmd && [ $IS_ROOT = 1 ]; then
    printf 'firewalld: %s\n' "$(tmo firewall-cmd --state 2>&1)"
    [ "$(tmo firewall-cmd --state 2>/dev/null)" = running ] && FW=1
  fi
  if [ $IS_ROOT = 0 ]; then
    printf '_No se puede leer el firewall sin root._\n'
  elif [ "${FW:-0}" != 1 ]; then
    printf '⚠️ No se detecta ningún firewall con reglas (ufw, nftables, iptables, firewalld).\n'
    warn 'Sin firewall activo detectado: todo puerto a la escucha está expuesto.'
  else
    printf '✅ Hay un firewall con reglas.\n'
  fi
}

accounts_audit() {
  h3 'Cuentas con shell de login'
  open
  awk -F: '($3>=1000 || $3==0) && $7 !~ /(nologin|false|sync|shutdown|halt)$/ && $7 != "" && $1 != "nobody" {printf "%-20s uid=%-6s %s\n", $1, $3, $7}' /etc/passwd 2>&1
  close
  h3 'Privilegios sudo'
  open
  for g in sudo wheel admin; do getent group "$g" 2>/dev/null | awk -F: '{printf "grupo %s: %s\n", $1, $4}'; done
  printf 'Ficheros en /etc/sudoers.d: %s\n' "$(ls /etc/sudoers.d 2>/dev/null | tr '\n' ' ')"
  if [ $IS_ROOT = 1 ]; then
    NP="$(grep -rhsE '^[^#]*NOPASSWD' /etc/sudoers /etc/sudoers.d 2>/dev/null | wc -l)"
    printf 'Reglas con NOPASSWD: %s\n' "$NP"
    [ "$NP" -gt 0 ] && warn "Hay $NP regla(s) sudo con NOPASSWD."
  fi
  close
  if [ -r /etc/shadow ]; then
    EMPTY="$(awk -F: '$2=="" {print $1}' /etc/shadow | tr '\n' ' ')"
    printf '\nCuentas con contraseña vacía: %s\n' "${EMPTY:-ninguna}"
    [ -n "$EMPTY" ] && warn "Cuentas con contraseña vacía: $EMPTY"
  fi
}

updates_audit() {
  h3 'Actualizaciones pendientes'
  if has apt-get; then
    SIM="$(tmo apt list --upgradable 2>/dev/null | grep '/')"
    TOT="$(printf '%s' "$SIM" | grep -c .)"
    SEC="$(printf '%s\n' "$SIM" | grep -i 'security' | sed 's#/.*##')"
    NSEC="$(printf '%s' "$SEC" | grep -c .)"
    printf 'Pendientes: **%s** (de seguridad: **%s**). Cálculo con la caché local de apt; puede estar desfasada si nadie ejecutó `apt update`.\n' "$TOT" "$NSEC"
    if [ "$NSEC" -gt 0 ]; then open; printf '%s\n' "$SEC" | head -30; close; warn "$NSEC paquete(s) con actualización de seguridad pendiente."; fi
    if dpkg -s unattended-upgrades >/dev/null 2>&1; then printf 'unattended-upgrades: instalado.\n'; else printf 'unattended-upgrades: no instalado (sin parches de seguridad automáticos).\n'; fi
  elif has dnf || has yum; then
    printf '_Sistema RPM: no se consulta automáticamente porque dnf/yum escriben registros. Ejecuta a mano `dnf updateinfo list security`._\n'
  else
    printf '_Gestor de paquetes no reconocido._\n'
  fi
  if [ -e /var/run/reboot-required ]; then printf '\n⚠️ Hay un reinicio pendiente (`/var/run/reboot-required`).\n'; warn 'Reinicio pendiente por actualizaciones.'; fi
  if has fail2ban-client && [ $IS_ROOT = 1 ]; then h3 'fail2ban'; show fail2ban-client status; fi
}

seguridad() {
  h2 '2. Ciberseguridad y accesos'
  ssh_audit
  firewall_audit
  accounts_audit
  updates_audit
}

red() {
  h2 '3. Red y servicios'
  h3 'Puertos y sockets a la escucha'
  if has ss; then
    open; tmo ss -tulpn 2>&1; close
    EXP="$(ss -tuln 2>/dev/null | awk 'NR>1 && $5 ~ /^(0\.0\.0\.0|\*|\[::\]|:::)/ {n=split($5,a,":"); print a[n]}' | sort -nu | tr '\n' ' ')"
    if [ -n "$EXP" ]; then
      printf '\nPuertos a la escucha en **todas** las interfaces: %s\n' "$EXP"
      warn "Puertos abiertos a todas las interfaces: $EXP— confirma que cada uno debe ser accesible desde fuera."
    fi
    [ $IS_ROOT = 0 ] && printf '\n_Sin root, la columna de proceso solo muestra tus propios procesos._\n'
  elif has netstat; then open; tmo netstat -tuln 2>&1; close
  else printf '_Ni `ss` ni `netstat` disponibles._\n'; fi

  h3 'Servicios systemd en ejecución'
  if [ -d /run/systemd/system ] && has systemctl; then
    open; tmo systemctl list-units --type=service --state=running --no-pager --no-legend 2>&1 | awk '{print $1, "-", $5, $6, $7, $8, $9}'; close
    FAILED="$(tmo systemctl --failed --no-legend --no-pager 2>/dev/null | awk '{print $2}' | tr '\n' ' ')"
    if [ -n "${FAILED# }" ]; then printf '\n⚠️ Servicios fallidos: %s\n' "$FAILED"; warn "Servicios systemd fallidos: $FAILED"; else printf '\n✅ Sin servicios fallidos.\n'; fi
  else
    printf '_systemd no está activo en este sistema._\n'
  fi

  h3 'Contenedores'
  for rt in docker podman; do
    if has "$rt"; then
      printf '**%s**\n\n' "$rt"
      open; tmo "$rt" ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1; close
    fi
  done
  has docker || has podman || printf '_Ni Docker ni Podman instalados._\n'

  h3 'Gestores de procesos (PM2)'
  if has pm2 && [ -f "${HOME:-/nonexistent}/.pm2/pm2.pid" ]; then
    show pm2 ls --no-color
  else
    printf '_Sin PM2 activo para este usuario (no se arranca el demonio para consultarlo)._\n'
  fi
  OTHERS="$(ls -d /home/*/.pm2/pm2.pid /root/.pm2/pm2.pid 2>/dev/null | grep -v "^${HOME:-/nonexistent}/" | sed 's#/\.pm2/pm2.pid##' | tr '\n' ' ')"
  [ -n "$OTHERS" ] && printf '\nExiste PM2 en: %s. Ejecuta el script como ese usuario para verlo.\n' "$OTHERS"
}

cron_clean() { # $1 = 1 si el fichero lleva columna de usuario (/etc/crontab, cron.d)
  awk -v hasuser="$1" '
    /^[[:space:]]*(#|$)/ {next}
    /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=/ {split($0,a,"="); print a[1] "=(oculto)"; next}
    { ns = ($1 ~ /^@/) ? 1 : 5; cmdi = ns + 1 + (hasuser ? 1 : 0)
      s=""; for (i=1;i<=ns;i++) s=s $i " "
      if (hasuser) s=s "[" $(ns+1) "] "
      s=s $cmdi; if (NF>cmdi) s=s " [args ocultos]"
      print s }'
}

organizacion() {
  h2 '4. Organización del sistema'
  h3 'Tamaño de directorios clave'
  printf '| Directorio | Tamaño |\n|---|---|\n'
  for d in /var/log /opt /srv /home /etc; do
    if [ -d "$d" ]; then
      s="$(tmo du -xsk "$d" 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')"
      printf '| `%s` | %s |\n' "$d" "${s:-no medible}"
    else printf '| `%s` | no existe |\n' "$d"; fi
  done
  [ $IS_ROOT = 0 ] && printf '\n_Sin root, los tamaños no incluyen lo que no puedes leer._\n'
  for d in /var/log /opt /srv /home; do
    [ -d "$d" ] || continue
    h3 "Contenido de $d (10 mayores)"
    open; tmo du -xk -d 1 "$d" 2>/dev/null | sort -rn | sed 1d | head -10 | awk '{printf "%10.1f MB  %s\n", $1/1024, $2}'; close
  done
  has journalctl && { h3 'Diario de systemd'; show journalctl --disk-usage; }

  h3 'Ficheros de entorno y claves (solo rutas y permisos, nunca el contenido)'
  open
  FILES="$(tmo find /opt /srv /home /root -maxdepth 4 -name node_modules -prune -o -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' \) -print 2>/dev/null)"
  if [ -n "$FILES" ]; then
    printf '%s\n' "$FILES" | while IFS= read -r f; do ls -l "$f" 2>/dev/null | awk '{print $1, $3, $NF}'; done
  else printf 'Ningún fichero .env encontrado en /opt /srv /home /root (profundidad 4).\n'; fi
  close
  OPENENV="$(tmo find /opt /srv /home /root -maxdepth 4 -name node_modules -prune -o -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' \) -perm /007 -print 2>/dev/null | wc -l)"
  [ "${OPENENV:-0}" -gt 0 ] && warn "$OPENENV fichero(s) .env legible(s) por cualquier usuario (conviene 600)."

  h3 'Tareas programadas'
  printf '**Crontab del usuario actual**\n\n'; open
  if has crontab; then tmo crontab -l 2>&1 | grep -v '^no crontab' | cron_clean 0; else echo '(crontab no disponible)'; fi
  close
  if [ $IS_ROOT = 1 ] && has crontab; then
    for u in $(awk -F: '($3>=1000) && $7 !~ /(nologin|false)$/ {print $1}' /etc/passwd 2>/dev/null); do
      OUT="$(tmo crontab -l -u "$u" 2>/dev/null | cron_clean 0)"
      [ -n "$OUT" ] && { printf '\n**Crontab de %s**\n\n' "$u"; open; printf '%s\n' "$OUT"; close; }
    done
  fi
  printf '\n**/etc/crontab y /etc/cron.d**\n\n'; open
  [ -r /etc/crontab ] && cron_clean 1 < /etc/crontab
  for f in /etc/cron.d/*; do [ -f "$f" ] && [ -r "$f" ] && { printf '# %s\n' "$f"; cron_clean 1 < "$f"; }; done
  close
  printf '\n**Scripts periódicos (/etc/cron.{hourly,daily,weekly,monthly})**\n\n'; open
  for p in hourly daily weekly monthly; do printf 'cron.%s: %s\n' "$p" "$(ls /etc/cron.$p 2>/dev/null | tr '\n' ' ')"; done
  close
  printf '\n**Timers de systemd**\n\n'
  if [ -d /run/systemd/system ] && has systemctl; then open; tmo systemctl list-timers --all --no-pager 2>&1; close; else printf '_systemd no activo._\n'; fi
}

resumen() {
  h2 '5. Resumen de hallazgos'
  printf '\n'
  if [ -n "$FIND" ]; then printf '%s' "$FIND"; else printf '✅ Sin hallazgos automáticos. Esto no sustituye una revisión manual.\n'; fi
  printf '\n_Los hallazgos son indicios automáticos: revisa cada uno antes de actuar._\n'
}

main() {
  cabecera
  host
  seguridad
  red
  organizacion
  resumen
}

main | sanitize
exit 0
