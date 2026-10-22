# Auditoría del servidor (`scripts/ops/audit-server.sh`)

Informe en Markdown del estado del servidor físico: hardware, seguridad, red y servicios, orden del sistema.
**Solo lectura:** no cambia ningún ajuste, no instala, no reinicia, no sale a internet y no escribe ficheros
(el informe sale por pantalla; lo guardas tú con `>`).

## Qué mira
1. **Hardware:** distribución, kernel, CPU, RAM, swap, discos y particiones, uptime, carga, procesos que más memoria usan (solo nombre).
2. **Seguridad:** SSH (`PermitRootLogin`, `PasswordAuthentication`, puerto, etc., con ✅/⚠️), firewall (ufw/nftables/iptables/firewalld),
   cuentas con shell, grupos sudo y reglas `NOPASSWD`, contraseñas vacías, permisos de claves SSH y de ficheros `.env`,
   actualizaciones de seguridad pendientes, reinicio pendiente.
3. **Red y servicios:** `ss -tulpn`, puertos abiertos a todas las interfaces, servicios systemd (y fallidos), Docker/Podman, PM2.
4. **Organización:** tamaño de `/var/log`, `/opt`, `/srv`, `/home`, `/etc`, tareas cron y timers de systemd.
5. **Resumen de hallazgos** con los ⚠️ acumulados.

## Qué nunca hace
- Abrir `.env`, claves privadas ni certificados: solo lista **rutas y permisos**.
- Mostrar argumentos de procesos, variables de entorno de PM2/Docker ni `docker inspect`.
- Ejecutar `apt update`, `dnf`, `sudo -l`, ni arrancar el demonio de PM2.
- Filtro final sobre todo el informe: IPs públicas → solo los dos primeros octetos (`a.b.x.x`), IPv6 globales → solo el primer grupo (`g::x`),
  MAC → `xx:xx:xx:xx:xx:xx`, `NOMBRE_CON_KEY/TOKEN/SECRET/PASS…=valor` → `***`, `usuario:clave@` en URL → `***@`, bloques largos tipo clave → `[oculto]`.
  En cron solo se muestran horario y programa (`[args ocultos]`).

**Límite honesto:** el filtro reconoce patrones, no sabe qué es un secreto. Un dato sensible con un formato raro
puede pasar (p. ej. una ruta con un nombre de cliente). Las IPs privadas (192.168.x.x, 10.x.x.x…), las de Tailscale (100.64–127.x.x) y el nombre del equipo
(salvo con `AUDIT_HIDE_HOST=1`) **no se enmascaran**: el informe describe tu red local. Lee el informe antes de compartirlo y no lo subas a ningún repositorio.

## Descargarlo
No hagas `git pull` sobre la carpeta de despliegue de Atlenza: traería código nuevo de la app. Copia solo `scripts/ops` a una carpeta aparte, desde tu ordenador
(procedimiento completo, con Windows y saltos de línea, en [servidor-llaves-ssh.md](servidor-llaves-ssh.md), Parte 4, paso 2):

```sh
ssh USUARIO@IP_DEL_SERVIDOR "mkdir -p ~/atlenza-ops"
scp -r scripts/ops USUARIO@IP_DEL_SERVIDOR:~/atlenza-ops/
```

Desde ahí, los comandos de abajo usan `ops/audit-server.sh` en lugar de `scripts/ops/audit-server.sh` (ejecútalos desde `~/atlenza-ops`).

## Ejecutarlo
Sin sudo (informe **parcial**: no ve reglas del firewall, configuración efectiva de SSH, crontabs ni procesos de otros usuarios):

```sh
sh ops/audit-server.sh > ~/auditoria-$(date +%F).md
```

Con sudo (informe **completo**, recomendado):

```sh
sudo sh ops/audit-server.sh > ~/auditoria-$(date +%F).md
chmod 600 ~/auditoria-$(date +%F).md
```

La redirección `>` la hace tu usuario, no root, así que el informe te pertenece. Tarda unos segundos
(cada comando tiene un límite de 20 s). Termina siempre con código 0: lo que no pueda leer lo anota en el informe.

Variables opcionales (delante del comando, tras `sudo`: `sudo AUDIT_HIDE_HOST=1 sh …`):

| Variable | Efecto |
|---|---|
| `AUDIT_HIDE_HOST=1` | oculta el nombre del equipo |
| `AUDIT_DISK_WARN=85` | % de disco a partir del cual avisa |
| `AUDIT_TIMEOUT=20` | segundos máximos por comando |

## Después
- Los ficheros `.env` solo se localizan (rutas y permisos, profundidad 4) en `/opt`, `/srv`, `/home` y `/root`. Para dejarlos en 600: [servidor-backups.md](servidor-backups.md), «Permisos de `.env*`».
- Guárdalo con `chmod 600` y fuera de cualquier repositorio; describe la superficie de ataque del servidor.
- Empieza por la sección 5 (hallazgos). Un ⚠️ es un indicio, no una orden: p. ej. el puerto 22 abierto puede ser lo que quieres.
- Las actualizaciones usan la caché local de apt: si hace tiempo que nadie ejecutó `apt update`, la cifra puede estar vieja.
  En sistemas RPM no se consultan (dnf escribe registros): `dnf updateinfo list security` a mano.
- Repite tras cambios importantes y compara dos informes con `diff`.

Ver también: [servidor-hardening.md](servidor-hardening.md) (corregir lo que el informe marque en SSH, parches y paneles), [servidor-backups.md](servidor-backups.md), [servidor-llaves-ssh.md](servidor-llaves-ssh.md).
