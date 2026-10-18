# Endurecimiento del servidor físico (SSH, parches y paneles)

En el servidor no hace falta tener el repo: copia `scripts/ops` a una carpeta aparte (ver [servidor-llaves-ssh.md](servidor-llaves-ssh.md), Parte 4) y sustituye `scripts/ops/` por `ops/` en los comandos de abajo.

`scripts/ops/harden-server.sh` cierra a Internet los paneles de gestión (Portainer 9000/9443, panel de NPM 81), desactiva el SSH por contraseña y activa los parches de seguridad desatendidos. **No toca Atlenza** (`lifeos-web`, `lifeos-db`), no reinicia servicios de la app y no recrea contenedores.

## Lo incómodo primero
- **Docker salta ufw.** Publica puertos con sus propias reglas de iptables: `ufw deny 81` no cierra un puerto publicado por Docker. La única forma fiable es cambiar el `ports:` del contenedor (`127.0.0.1:81:81`), y eso exige **recrearlo**.
- **Recrear NPM corta 80/443 unos segundos** (Atlenza no responde en ese tiempo). Por eso el script solo genera ficheros e imprime los comandos: los lanzas tú, en una hora tranquila.
- **Recrear con una plantilla puede perder datos** si el volumen apunta a otra ruta (hosts y certificados de NPM). El script detecta las rutas y redes del contenedor actual y las vuelca en el `.env`; si no las detecta, la plantilla se niega a arrancar. Si NPM usa MariaDB (`DB_MYSQL_*`) o ya vive en un `docker-compose.yml`, no uses la plantilla: edita el puerto ahí.
- **No he probado esto en un servidor real** (el contenedor de desarrollo no tiene sshd, Docker ni Tailscale): `selftest.sh` lo prueba con programas simulados. La primera vez, **solo `--dry-run`** y léelo entero.

## Qué hace cada parte
| Parte | Cambio | Seguridad |
|---|---|---|
| `ssh` | `/etc/ssh/sshd_config.d/99-hardening.conf`: `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`, `PermitRootLogin prohibit-password` | Exige `~usuario/.ssh/authorized_keys` con ≥ 1 clave válida y permisos que `StrictModes` acepte; comprueba que `sshd_config` incluye `sshd_config.d`; `sshd -t`; comprueba con `sshd -T` que la contraseña queda realmente desactivada (sshd usa la **primera** coincidencia: un `50-cloud-init.conf` con `yes` ganaría al 99); si algo falla, **revierte** el fichero. Solo `reload`, nunca `restart` |
| `updates` | `unattended-upgrades` + `20auto-upgrades` + `52atlenza-unattended` | Añade el origen `Debian-Security` de trixie a lo que Debian ya permite por defecto en `50unattended-upgrades`, que incluye también las actualizaciones normales (`label=Debian`) de la rama estable, no solo las de seguridad; no actualiza repos de terceros como Docker. Si quieres solo seguridad, comenta con `//` la línea `label=Debian` de `50unattended-upgrades` y comprueba con `sudo unattended-upgrade --dry-run -d | grep -i 'allowed origins'`; `Automatic-Reboot "false"` (un reinicio del host reiniciaría Atlenza). Avisa si `needrestart` puede reiniciar Docker |
| `panels` | Plantillas `scripts/ops/templates/{portainer,npm}.compose.yml` + `.env` en `--out` | Portainer 9000/9443 en `PANEL_BIND` (IP de Tailscale detectada, si no `127.0.0.1`); **panel 81 de NPM siempre en `127.0.0.1`** (`NPM_ADMIN_BIND`), con acceso por túnel SSH; solo 80/443 en `0.0.0.0`. `--bind 0.0.0.0` se rechaza. Si Portainer o NPM viven en un `docker-compose.yml` propio, no genera plantilla para ellos: indica la carpeta y la edición exacta del `ports:` |

Opciones: `--dry-run` (por defecto), `--apply` (root, avisos y escribir `SI`; `--yes` se salta solo la pregunta), `--only ssh|updates|panels`, `--user`, `--bind`, `--out`.

## Procedimiento paso a paso
1. **Antes de nada (en tu portátil):** copia tu llave si no lo has hecho (`ssh-copy-id usuario@servidor`) y comprueba que entra **sin contraseña**: `ssh -o PasswordAuthentication=no usuario@servidor`. Deja esa sesión abierta y ten a mano la consola web del proveedor o teclado físico (plan B). Con varios equipos, cada uno necesita su llave: ver [servidor-llaves-ssh.md](servidor-llaves-ssh.md).
2. **Foto de puertos antes:** `sudo ss -tulpn` y guarda la salida (te servirá para comparar).
3. **Simulación:** `sudo bash scripts/ops/harden-server.sh` (o `--dry-run`). Lee los `BLOQUEO` y `AVISO`; no cambia nada.
4. **Parches:** `sudo bash scripts/ops/harden-server.sh --apply --only updates`. Comprueba `systemctl list-timers 'apt-daily*'` y `sudo unattended-upgrade --dry-run`.
5. **SSH:** `sudo bash scripts/ops/harden-server.sh --apply --only ssh --user <tu_usuario>`. Sigue el protocolo de abajo **antes** de cerrar nada.
6. **Paneles** (ventana tranquila): `sudo bash scripts/ops/harden-server.sh --apply --only panels` genera `./hardening-out/` (`.env`, `portainer.compose.yml`, `npm.compose.yml`) e imprime los comandos. Revisa el `.env` (rutas de datos), guarda `docker inspect` (contiene variables de entorno: `chmod 600`, no lo subas a ningún sitio) y lanza primero Portainer, luego NPM.
7. **Foto de puertos después** y verificación externa (abajo).

## Comprobar puertos
```sh
sudo ss -tulpn | grep -E ':(22|80|81|443|9000|9443)\b'
```
Esperado: `22`, `80` y `443` en `0.0.0.0`/`[::]`; `81`, `9000` y `9443` solo en `127.0.0.1` o en la IP de Tailscale (`100.x.y.z`). Cualquier `0.0.0.0:81`, `[::]:9443` o `*:9000` es un panel expuesto.
Desde **fuera** de tu red (datos del móvil, sin Tailscale): `nc -zv <IP-pública> 81` debe fallar y `nc -zv <IP-pública> 443` conectar. Comprueba también que Atlenza responde por su dominio.
Acceso a los paneles: con Tailscale, `https://<IP-tailscale>:9443` y `http://<IP-tailscale>:81`; sin él, túnel: `ssh -L 9443:127.0.0.1:9443 -L 8081:127.0.0.1:81 usuario@servidor` y abrir `https://127.0.0.1:9443` / `http://127.0.0.1:8081`.

## Protocolo para no perder el acceso SSH
1. **No cierres** la sesión desde la que aplicas el cambio. El `reload` no corta las sesiones abiertas.
2. En **otra terminal nueva**: `ssh usuario@servidor` debe entrar con la llave.
3. La contraseña debe fallar: `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password usuario@servidor` → `Permission denied (publickey)`.
4. Solo entonces cierras la sesión original. Si algo falla, **desde la sesión que sigue abierta**: `sudo rm /etc/ssh/sshd_config.d/99-hardening.conf && sudo sshd -t && sudo systemctl reload ssh`.
5. Sin sesión abierta: consola web del proveedor o teclado físico y el mismo comando.
6. Si usas otro usuario (p. ej. `root`), pásalo con `--user`: el script comprueba las llaves de **ese** usuario, no de quien eres tú ahora.

## Tailscale y el orden de arranque
Un contenedor publicado en `100.x.y.z` no arranca si `tailscale0` aún no existe cuando Docker lo levanta (*cannot assign requested address*). [Probable] que, tras un reinicio del host, el contenedor se quede parado hasta que lo arranques a mano; no lo he probado. Por eso **el panel 81 de NPM va siempre a `127.0.0.1`**: NPM es la puerta pública de Atlenza (80/443) y no debe depender de Tailscale. El panel se abre con un túnel: `ssh -L 8081:127.0.0.1:81 usuario@servidor` y luego `http://localhost:8081`.
Portainer sí puede ir a la IP de Tailscale: si no arranca tras un reinicio, solo cae Portainer. En un reinicio real (una sola prueba) arrancó bien. Para evitarlo, un *drop-in* que haga `After=tailscaled.service` en `docker.service` (`systemctl edit docker`), o `--bind 127.0.0.1` y túnel.

## Cuánta exposición hay de verdad
«Escucha en todas las interfaces» no es «está en Internet»: Docker publica en `0.0.0.0`, que ve toda tu red local, y llega a Internet solo si **el router reenvía ese puerto** o si el servidor tiene **IPv6 público**. Antes de decidir la urgencia comprueba:
- En el router, NAT/PAT: qué puertos externos van al servidor (lo normal es solo 80 y 443), la pestaña **DMZ** (debe estar vacía) y **UPnP** (si está activo, cualquier programa de tu red puede abrir puertos; desactívalo si no lo necesitas).
- IPv6: `ip -6 addr show scope global | grep inet6`. Una dirección `fd7a:...` es la de Tailscale, no es pública.
- Desde fuera de casa (datos del móvil, sin wifi ni Tailscale), un comprobador de puertos sobre tu IP pública: 80 y 443 abiertos, el resto cerrados.
- Cualquier otro reenvío del router (p. ej. Escritorio Remoto, puerto 3389) es una puerta a ese equipo, y el equipo desde el que administras el servidor guarda tus llaves SSH: usa Tailscale para eso en vez de abrir el puerto.

## Kernel nuevo y reinicio
`unattended-upgrades` instala solo los kernels nuevos (y borra el más viejo), pero no reinicia (`Automatic-Reboot "false"`): hasta que reinicies sigues con el kernel anterior. `sudo needrestart -b -r l` lo dice (`NEEDRESTART-KSTA: 3` = hay un kernel nuevo pendiente; `1` = al día). Fíate de la ejecución real y no del `--dry-run`: la simulación no listaba el kernel y la real sí lo instaló.
Reinicia en un momento tranquilo y con acceso físico por si algo no arranca (GRUB conserva el kernel anterior). Después comprueba `uname -r`, `docker ps`, los puertos (`ss -tulpn`) y Atlenza por su dominio. Tras el reinicio, la base de datos y la web pueden tardar 1-2 minutos en pasar a `healthy` (primero `unhealthy` y `starting`): no reinicies nada a mano. Si Portainer no arranca, `docker start portainer`.

## Deshacer
- SSH: borrar `99-hardening.conf` + `reload` (arriba).
- Parches: `sudo apt-get remove unattended-upgrades` y borrar `/etc/apt/apt.conf.d/52atlenza-unattended`.
- Paneles: recrear el contenedor con el puerto anterior (según tu `docker inspect` guardado).

## Pruebas
`bash scripts/ops/selftest.sh` (sin servidor, con `sshd`/`docker`/`ss`/`apt-get`/`tailscale` simulados): comprueba que la simulación no escribe, que sin llaves o con permisos peligrosos aborta, que `sshd -t` o `sshd -T` fallidos revierten, que nunca hay `restart`, y que ninguna plantilla publica un panel en `0.0.0.0`.
