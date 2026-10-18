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
- Filtro final sobre todo el informe: IPs públicas → `203.0.x.x`, IPv6 globales → `2001::x`, MAC enmascaradas,
  `NOMBRE_CON_KEY/TOKEN/SECRET/PASS…=valor` → `***`, `usuario:clave@` en URL, bloques largos tipo clave → `[oculto]`.
  En cron solo se muestran horario y programa (`[args ocultos]`).

**Límite honesto:** el filtro reconoce patrones, no sabe qué es un secreto. Un dato sensible con un formato raro
puede pasar (p. ej. una ruta con un nombre de cliente). Lee el informe antes de compartirlo.

## Descargarlo
Desde el clon del servidor (el repositorio es privado, no hay `curl` a un enlace público):

```sh
cd /ruta/a/AtleticHomeDesing && git pull
```

O copiarlo desde tu ordenador: `scp scripts/ops/audit-server.sh usuario@servidor:~/`.

## Ejecutarlo
Sin sudo (informe **parcial**: no ve reglas del firewall, configuración efectiva de SSH, crontabs ni procesos de otros usuarios):

```sh
sh scripts/ops/audit-server.sh > ~/auditoria-$(date +%F).md
```

Con sudo (informe **completo**, recomendado):

```sh
sudo sh scripts/ops/audit-server.sh > ~/auditoria-$(date +%F).md
chmod 600 ~/auditoria-$(date +%F).md
```

La redirección `>` la hace tu usuario, no root, así que el informe te pertenece. Tarda unos segundos
(cada comando tiene un límite de 20 s).

Variables opcionales (delante del comando, tras `sudo`: `sudo AUDIT_HIDE_HOST=1 sh …`):

| Variable | Efecto |
|---|---|
| `AUDIT_HIDE_HOST=1` | oculta el nombre del equipo |
| `AUDIT_DISK_WARN=85` | % de disco a partir del cual avisa |
| `AUDIT_TIMEOUT=20` | segundos máximos por comando |

## Después
- Guárdalo con `chmod 600` y fuera de cualquier repositorio; describe la superficie de ataque del servidor.
- Empieza por la sección 5 (hallazgos). Un ⚠️ es un indicio, no una orden: p. ej. el puerto 22 abierto puede ser lo que quieres.
- Las actualizaciones usan la caché local de apt: si hace tiempo que nadie ejecutó `apt update`, la cifra puede estar vieja.
  En sistemas RPM no se consultan (dnf escribe registros): `dnf updateinfo list security` a mano.
- Repite tras cambios importantes y compara dos informes con `diff`.
