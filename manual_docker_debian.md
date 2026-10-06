# LifeOS — Despliegue con Docker en Debian

Guía de comandos para levantar la PWA en un servidor Debian 12 (bookworm) o 13 (trixie).
Para la arquitectura interna, ver [`manual_backend.md`](manual_backend.md).

```
Internet ──HTTPS──► Caddy / NPM (:443) ──► web (Next.js, 127.0.0.1:3000)
                                              │
                                              ▼
                                   db (PostgreSQL 17 + pgvector) ◄── pgadmin (bajo demanda, 127.0.0.1:5050, vía túnel SSH)
                                   volúmenes: pgdata · uploads · pgadmin
```

| Servicio | Imagen | Puerto en el host | Se arranca con `up` |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg17` | `127.0.0.1:5432` | Sí |
| `web` | Build local (`Dockerfile`, target `runner`) | `127.0.0.1:3000` | Sí |
| `pgadmin` | `dpage/pgadmin4` | `127.0.0.1:5050` | No: bajo demanda (perfil `pgadmin`, § 7) |
| `migrate` | Build local (target `migrate`) | — | No: tarea puntual (perfil `tools`) que aplica migraciones y seed, y ejecuta `npm run user` (§ 8) |

> **Por qué HTTPS:** el service worker (PWA instalable) y la cámara del escáner de códigos de barras solo funcionan en contexto seguro (HTTPS o `localhost`).

---

## 1. Requisitos

- Debian 12 o 13 de 64 bits, con acceso `sudo`.
- **≥ 2 GB de RAM** (4 GB recomendados): el `next build` dentro de Docker consume ~1,5 GB. Con menos memoria, añade swap (§ 9).
- ~5 GB de disco libres, más tus datos.
- Un dominio apuntando a la IP del servidor (registro A/AAAA) para obtener HTTPS automático.
- Opcional: una clave de Gemini (`GEMINI_API_KEY`) para Astras AI. Sin ella, todo lo demás funciona.

---

## 2. Instalar Docker Engine y Compose

Repositorio oficial de Docker (el paquete `docker.io` de Debian no trae el plugin `compose` v2):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Usar docker sin sudo (cierra sesión y vuelve a entrar después)
sudo usermod -aG docker "$USER"
```

Comprobación:

```bash
docker version
docker compose version
docker run --rm hello-world
```

---

## 3. Obtener el código

```bash
sudo mkdir -p /opt/lifeos && sudo chown "$USER": /opt/lifeos
git clone https://github.com/Kirito8888/AtleticHomeDesing.git /opt/lifeos
cd /opt/lifeos
git checkout claude/blissful-gauss-warwif   # o main, cuando se haga merge
```

---

## 4. Configurar `.env.production`

**Ninguna credencial va en el código ni en la imagen.** Todo se lee de este fichero, que está en `.gitignore`.

```bash
cp .env.example .env.production
chmod 600 .env.production

# Genera secretos fuertes
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "PGADMIN_DEFAULT_PASSWORD=$(openssl rand -hex 16)"
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)"
docker run --rm node:22-alpine npx -y web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (opcional)

nano .env.production
```

Valores a revisar:

| Variable | Valor en producción |
|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | `lifeos` (o lo que prefieras) |
| `POSTGRES_PASSWORD` | El generado arriba. Usa hex: sin `@ : / ?`, que romperían la URL de conexión |
| `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` | Tu email y el valor generado arriba |
| `AUTH_SECRET` | El generado arriba. Si cambia, todas las sesiones se cierran |
| `AUTH_URL` | La URL pública **exacta**: `https://lifeos.tudominio.es`. Con `https://` se activa además `upgrade-insecure-requests` en la CSP |
| `ALLOW_REGISTRATION` | `false`: nadie puede crear cuentas desde `/register` salvo el primer usuario de una instalación vacía. Las demás cuentas, con `npm run user -- create` (§ 8) |
| `SCHEDULER_ENABLED` | `true`: cobra suscripciones a diario y genera el informe semanal del coach (solo a quien activó la IA) |
| `UPLOAD_QUOTA_MB` | Espacio de apuntes por usuario (por defecto 200) |
| `TOTP_ENCRYPTION_KEY` | El generado arriba. Cifra los secretos de la verificación en dos pasos. **Guárdalo con tus copias**: si se pierde, quien tenga 2FA tendrá que desactivarla con `npm run user -- disable-2fa` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Notificaciones push (opcional). `VAPID_SUBJECT=mailto:tu@email`. Si cambian las claves, cada dispositivo debe volver a activar las notificaciones |
| `WEB_LOG_DRIVER` | `journald` en Debian (lo necesita fail2ban, § 6); `json-file` en Docker Desktop |
| `BACKUP_AGE_RECIPIENT` | Clave **pública** de age para el servicio de copias (§ 8). Opcional |
| `WEB_BIND` / `WEB_PORT` | `127.0.0.1` / `3000` (detrás de Caddy) |
| `GEMINI_API_KEY` | Tu clave (opcional) |
| `GEMINI_CHAT_MODEL` | Modelo de chat disponible en tu cuenta de Google AI |
| `GEMINI_EMBEDDING_MODEL` / `GEMINI_EMBEDDING_DIM` | **No los cambies** tras subir apuntes: la columna es `vector(768)` y habría que re-vectorizar |
| `OFF_USER_AGENT` | `"LifeOS/1.0 (tu-email@dominio.es)"` (OpenFoodFacts lo exige; entre comillas por los paréntesis) |
| `UPLOAD_DIR` | `./uploads` (dentro del contenedor es `/app/uploads`, en un volumen) |

`DATABASE_URL` no hace falta tocarla: `docker-compose.yml` la construye dentro de la red de Docker (`@db:5432`) a partir de `POSTGRES_*`.

> El fichero se usa de dos formas: con `--env-file` (sustitución de `${VAR}` en `docker-compose.yml`) y como `env_file` dentro de los contenedores. Por eso **todos los comandos llevan `--env-file .env.production`**. Para no repetirlo:
>
> ```bash
> alias dc='docker compose --env-file .env.production'
> ```
>
> El resto de la guía usa `dc`.

---

## 5. Primer arranque

```bash
cd /opt/lifeos

# 1. Base de datos
dc up -d db
dc ps                      # espera a que db esté "healthy"

# 2. Migraciones + seed (extensión vector, 37 tablas, índice HNSW,
#    trigger de partida doble y catálogo de ejercicios). Idempotente.
dc --profile tools run --rm --build migrate

# 3. Aplicación (la primera vez compila la imagen: unos minutos)
dc up -d --build web

# 4. Comprobar
dc ps
dc logs -f web             # Ctrl+C para salir
curl -I http://127.0.0.1:3000/login     # → 200
```

---

## 6. HTTPS con Caddy (recomendado)

Caddy obtiene y renueva el certificado de Let's Encrypt automáticamente.

```bash
sudo apt-get install -y caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
lifeos.tudominio.es {
    encode zstd gzip
    request_body {
        max_size 20MB          # subida de apuntes (límite de la app: 15 MB)
    }
    reverse_proxy 127.0.0.1:3000
}
EOF

sudo systemctl reload caddy
```

Abre en el firewall solo SSH, HTTP y HTTPS:

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

> **Importante:** Docker inserta sus propias reglas de iptables, y **un puerto publicado como `0.0.0.0:3000` queda abierto aunque ufw lo bloquee**. Por eso `docker-compose.yml` publica `web`, `db` y `pgadmin` solo en `127.0.0.1`. Si cambias `WEB_BIND` a `0.0.0.0`, protégelo con un firewall externo (el del proveedor).

Comprueba `https://lifeos.tudominio.es`, crea tu cuenta (la primera; después el registro se cierra solo si `ALLOW_REGISTRATION=false`) y, desde el móvil, usa **"Añadir a pantalla de inicio" / "Instalar app"**.

**Alternativa con nginx** (si ya lo usas): `proxy_pass http://127.0.0.1:3000;` con `client_max_body_size 20m;` y `proxy_set_header Host $host; X-Forwarded-Proto $scheme; X-Forwarded-For $proxy_add_x_forwarded_for;`, y certificado con `certbot --nginx`. Nginx Proxy Manager y Caddy ya envían `X-Forwarded-For`.

> **Límite de intentos por IP:** la app toma la IP del cliente de la **última** entrada de `X-Forwarded-For` (la que añade tu proxy). Por eso la app **no** debe ser accesible sin pasar por el proxy: deja `WEB_BIND=127.0.0.1` (o, con Nginx Proxy Manager en Docker, sin publicar el puerto).

### Bloquear IPs con fail2ban (recomendado)

La app ya limita los intentos (10 por IP cada 15 min y 5 por cuenta), pero fail2ban corta el tráfico **antes** de que llegue: tras 8 inicios de sesión fallidos en 10 min, la IP queda bloqueada 1 h en el cortafuegos. Cada fallo deja en el log una línea `[auth] login fallido ip=… motivo=…`.

```bash
sudo apt-get install -y fail2ban
# 1. Logs del contenedor web en journald: en .env.production
echo "WEB_LOG_DRIVER=journald" >> .env.production
dc up -d web
# 2. Filtro y jail de LifeOS
sudo cp deploy/fail2ban/filter.d/lifeos-auth.conf /etc/fail2ban/filter.d/
sudo cp deploy/fail2ban/jail.d/lifeos.conf /etc/fail2ban/jail.d/
sudo systemctl restart fail2ban
# 3. Comprobar
sudo fail2ban-client status lifeos-auth
sudo journalctl CONTAINER_NAME=lifeos-web-1 | grep "login fallido" | tail -3
```

> **Por qué `chain = DOCKER-USER`:** el tráfico que va a Nginx Proxy Manager (un contenedor) no pasa por la cadena `INPUT` del host; si fail2ban bloquea ahí, no tiene efecto. La jail incluida ya usa `DOCKER-USER`. Revisa `ignoreip` en `/etc/fail2ban/jail.d/lifeos.conf` para no bloquearte desde tu red local o Tailscale. Desbloquear una IP: `sudo fail2ban-client set lifeos-auth unbanip 1.2.3.4`.

---

## 7. pgAdmin (bajo demanda)

No arranca con `dc up`: es una puerta de entrada a todos los datos y casi nunca hace falta (para usuarios y contraseñas usa `npm run user`, § 8). Arráncalo solo cuando lo necesites:

```bash
dc --profile pgadmin up -d pgadmin
ssh -L 5050:127.0.0.1:5050 usuario@tu-servidor   # desde tu ordenador
# abre http://localhost:5050 … y al terminar:
dc --profile pgadmin stop pgadmin
```

Para registrar el servidor en pgAdmin:

1. Entra con `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`.
2. *Add New Server* → *Connection*:
   - Host: `db`
   - Puerto: `5432`
   - Usuario: `POSTGRES_USER`
   - Contraseña: `POSTGRES_PASSWORD`

> No modifiques a mano la estructura de las tablas: se gestiona con migraciones de Prisma. La tabla `DocumentChunk` y su índice HNSW se gestionan con SQL manual (ver `manual_backend.md` § 5.1).

---

## 8. Operación diaria

### Comandos habituales

```bash
dc ps                          # estado
dc logs -f --tail=200 web      # logs de la app
dc logs -f db
dc restart web
dc stop                        # parar todo (los datos persisten en volúmenes)
dc up -d                       # arrancar de nuevo
dc exec db psql -U lifeos -d lifeos     # consola SQL
```

### Usuarios (sin SQL)

Las contraseñas se generan aleatoriamente y se muestran una sola vez (nunca se escriben en la línea de comandos, para que no queden en el historial):

```bash
dc --profile tools run --rm migrate npm run user -- list
dc --profile tools run --rm migrate npm run user -- create ana@correo.es --name "Ana" --role ATHLETE
dc --profile tools run --rm migrate npm run user -- reset-password ana@correo.es   # además cierra sus sesiones
dc --profile tools run --rm migrate npm run user -- unlock ana@correo.es           # tras 5 intentos fallidos
dc --profile tools run --rm migrate npm run user -- set-role ana@correo.es COACH
dc --profile tools run --rm migrate npm run user -- disable-2fa ana@correo.es      # perdió el móvil y los códigos
```

Cada usuario puede, en **Ajustes**: cambiar su contraseña y su email, activar la verificación en dos pasos, ver su actividad reciente, activar notificaciones, cerrar sesión en todos sus dispositivos, elegir qué ve su entrenador, descargar sus datos y borrar su cuenta.

### Actualizar a una nueva versión

Desde la v1.2, con un solo comando:

```bash
cd /opt/lifeos
./scripts/update.sh
```

Hace, en orden: copia de la BD (cifrada si `BACKUP_AGE_RECIPIENT` está definido y tienes `age`, en `./backups-pre-update/`) → guarda la imagen actual como `lifeos-web:previous` → `git pull` de `main` → migraciones → reconstruye `web` → espera a que el healthcheck diga *healthy*. **Si algo falla, vuelve sola a la versión anterior** y te dice qué mirar. Las migraciones son siempre aditivas, así que la versión anterior funciona con la BD ya migrada.

A mano (equivalente, sin vuelta atrás automática):

```bash
git pull
dc --profile tools run --rm --build migrate
dc up -d --build web
docker image prune -f
```

#### De v1.1 a v1.2 (20 mejoras)

La migración `v1_2_features` solo **crea** tipos, columnas, tablas e índices. Los vínculos coach–atleta existentes reciben todos los permisos (nada cambia para ellos hasta que el atleta los ajuste). Probada sobre una BD v1.1 con datos.

1. Añade a `.env.production`:
   ```bash
   TOTP_ENCRYPTION_KEY=...   # openssl rand -base64 32 — necesaria para la 2FA
   WEB_LOG_DRIVER=journald   # para fail2ban (§ 6)
   # Opcional, notificaciones push:
   VAPID_PUBLIC_KEY=...      # docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:tu@email
   # Opcional, copias automáticas:
   BACKUP_AGE_RECIPIENT=age1...
   ```
2. Esta primera vez actualiza a mano (el script `update.sh` llega con esta versión): `git pull`, `dc --profile tools run --rm --build migrate`, `dc up -d --build web`. A partir de ahí, `./scripts/update.sh`.
3. Comprueba `dc ps`: `web` debe aparecer como **healthy** (nuevo healthcheck).
4. Opcional: fail2ban (§ 6) y el servicio de copias (abajo).
5. En la app: activa la verificación en dos pasos y las notificaciones en **Ajustes**.

#### De v1.0 a v1.1 (seguridad y privacidad)

La migración `v1_1_security_privacy` solo **añade** columnas a `User` con valores por defecto: no borra ni modifica datos y las sesiones abiertas siguen valiendo.

1. Copia de seguridad antes de nada (ver abajo).
2. Añade a `.env.production` (si no están, se usan estos valores por defecto):
   ```bash
   ALLOW_REGISTRATION=false
   SCHEDULER_ENABLED=true
   UPLOAD_QUOTA_MB=200
   ```
3. Actualiza como siempre (`git pull` → `migrate` → `up -d --build web`).
4. pgAdmin ya no arranca con `up`. Si estaba en marcha, páralo: `dc --profile pgadmin stop pgadmin`.
5. **Astras AI queda desactivado** para todos hasta que cada usuario lo autorice en *Ajustes → Privacidad e IA*.

### Copias de seguridad (cifradas)

La base de datos contiene datos de salud (VFC, FC, sueño), finanzas y apuntes: **las copias se cifran** con [`age`](https://github.com/FiloSottile/age) usando una clave pública. El servidor solo tiene la pública, así que quien robe las copias (o el servidor) no puede leerlas. La clave privada se queda en tu ordenador o en un gestor de contraseñas.

Una sola vez, **en tu ordenador** (no en el servidor):

```bash
sudo apt-get install -y age          # o: brew install age / winget install FiloSottile.age
age-keygen -o lifeos-backup.key      # imprime "Public key: age1…"
```

Guarda `lifeos-backup.key` en lugar seguro (sin ella las copias no se pueden restaurar).

#### Automáticas: servicio `backup` (recomendado)

Cada día a `BACKUP_TIME` (03:30 por defecto, hora de Madrid) hace `pg_dump`, **lo restaura en una base de datos temporal para comprobar que la copia sirve**, lo cifra con tu clave pública y conserva `BACKUP_KEEP_DAYS` días. También copia los apuntes subidos. Las copias quedan en `./backups/` (junto al `docker-compose.yml`).

```bash
echo "BACKUP_AGE_RECIPIENT=age1…tu-clave-pública…" >> .env.production
dc --profile backup up -d --build backup
dc logs backup        # al arrancar hace una copia: busca "[backup] ok … restauración verificada"
ls -lh backups/
```

Si una copia falla, el log dice `[backup] FALLO` y el motivo. Sube `./backups/` a otro sitio (están cifradas: cualquier nube vale).

#### Manuales (o con cron, si no usas el servicio)

En el servidor:

```bash
sudo apt-get install -y age
sudo mkdir -p /var/backups/lifeos && sudo chown "$USER": /var/backups/lifeos && chmod 700 /var/backups/lifeos
echo "age1…tu-clave-pública…" > /opt/lifeos/backup.pub
cd /opt/lifeos

# Base de datos (formato custom) → cifrada
dc exec -T db pg_dump -U lifeos -d lifeos -Fc | age -R backup.pub > /var/backups/lifeos/db-$(date +%F).dump.age

# Apuntes subidos → cifrados
docker run --rm -v lifeos_uploads:/data:ro alpine tar czf - -C /data . \
  | age -R backup.pub > /var/backups/lifeos/uploads-$(date +%F).tgz.age
```

Copia diaria automática a las 03:30, conservando 14 días (`crontab -e`):

```cron
30 3 * * * cd /opt/lifeos && docker compose --env-file .env.production exec -T db pg_dump -U lifeos -d lifeos -Fc | age -R backup.pub > /var/backups/lifeos/db-$(date +\%F).dump.age && find /var/backups/lifeos -name 'db-*.dump.age' -mtime +14 -delete
```

Guarda también una copia **fuera del servidor** (`rclone`, `rsync` a otra máquina…): al estar cifradas, puedes subirlas a cualquier nube. Guarda aparte `.env.production` (también cifrado: `age -R backup.pub .env.production > env.age`). Sin `AUTH_SECRET` las sesiones se invalidan; sin `POSTGRES_PASSWORD` no podrás conectar con el volumen existente.

> Las copias antiguas en claro (`db-*.dump` sin `.age`) bórralas cuando tengas la primera cifrada: `rm /var/backups/lifeos/*.dump`.

### Restaurar

Copia al servidor tu clave privada **solo durante la restauración**. Las copias del servicio `backup` están en `./backups/` con nombres `db-AAAA-MM-DD_HHMM.dump.age` (y `uploads-…tgz.age`): usa esas rutas en lugar de `/var/backups/lifeos/…`.

```bash
dc stop web
age -d -i lifeos-backup.key /var/backups/lifeos/db-AAAA-MM-DD.dump.age \
  | dc exec -T db pg_restore -U lifeos -d lifeos --clean --if-exists
age -d -i lifeos-backup.key /var/backups/lifeos/uploads-AAAA-MM-DD.tgz.age \
  | docker run --rm -i -v lifeos_uploads:/data alpine sh -c "cd /data && tar xzf -"
dc up -d web
shred -u lifeos-backup.key            # no dejes la clave privada en el servidor
```

---

## 9. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El build de `web` muere sin mensaje (`Killed`, código 137) | Falta de memoria | Añade swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` (para hacerlo permanente: `echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab`) |
| `required variable POSTGRES_USER is missing` | Falta `--env-file .env.production` | Usa el alias `dc` |
| Tras iniciar sesión redirige a `localhost` u otro dominio | `AUTH_URL` no coincide con la URL pública | Corrígelo y ejecuta `dc up -d web` |
| `password authentication failed` tras cambiar `POSTGRES_PASSWORD` | El volumen guarda la contraseña de la primera inicialización | Vuelve a la anterior o cámbiala dentro: `dc exec db psql -U lifeos -c "ALTER USER lifeos PASSWORD '…'"` |
| Astras AI: "no está configurado" | Falta `GEMINI_API_KEY` | Añádela y ejecuta `dc up -d web` |
| Astras AI: "Activa el consentimiento de IA" | El usuario no ha autorizado el envío a Gemini | *Ajustes → Privacidad e IA* |
| Login: "Demasiados intentos" | 5 fallos seguidos en la cuenta (bloqueo de 15 min) o 10 intentos desde la misma IP en 15 min | Espera, o `npm run user -- unlock <email>` (§ 8). Si **todos** los usuarios ven el aviso a la vez, tu proxy no envía `X-Forwarded-For` y todos comparten IP |
| `/register` dice "Registro cerrado" | `ALLOW_REGISTRATION=false` y ya existe algún usuario | Crea la cuenta con `npm run user -- create` |
| Perdí el móvil con la app de 2FA y los códigos de recuperación | — | `npm run user -- disable-2fa <email>` (también cierra sus sesiones) |
| "La verificación en dos pasos no está configurada" | Falta `TOTP_ENCRYPTION_KEY` | Añádela (`openssl rand -base64 32`) y `dc up -d web` |
| No llegan notificaciones | Sin claves VAPID, permiso denegado en el navegador, o iPhone sin la PWA instalada | Ajustes → Notificaciones → *Enviar prueba*. En iOS (16.4+), instala la app en la pantalla de inicio |
| `dc ps` muestra `web` como *unhealthy* | La app no llega a la BD | `dc logs --tail=100 web` y `curl http://127.0.0.1:3000/api/health` |
| Apuntes en "Pendiente" para siempre | La cola de ingesta no arrancó | Busca `[jobs]` en `dc logs web`. Los fallidos se reintentan desde Astras AI → *Reintentar* |
| Importar extracto: "Importe no válido" en muchas líneas | Columna o formato decimal mal elegidos | En la vista previa, cambia *Importe* o *Decimales*. Guarda el formato para el próximo mes |
| Gemini responde con error de modelo | `GEMINI_CHAT_MODEL` no está disponible en tu cuenta | Cambia a un modelo listado en Google AI Studio |
| Buscador de alimentos: "resultados de tu caché local" | OpenFoodFacts no responde o devuelve 429 (~10 búsquedas/min) | Espera un minuto. Los productos ya consultados siguen disponibles |
| El escáner no abre la cámara | Sin HTTPS, permiso denegado o navegador sin Barcode Detection API (Firefox, Safari sin flag) | Usa HTTPS o introduce el EAN a mano |
| No aparece "Instalar app" | Sin HTTPS, o el service worker no se ha registrado | Revisa en DevTools → Application → Manifest / Service Workers |
| `migrate` falla con `P3009` | Una migración quedó a medias | Revisa `dc --profile tools run --rm migrate npx prisma migrate status` y resuélvela con `prisma migrate resolve` |

### Desarrollo local (sin Docker para la app)

Para desarrollar en tu máquina: base de datos en Docker y Next.js en el host.

```bash
cp .env.example .env.local      # DATABASE_URL apunta a localhost:5432
# APP_ENV_FILE: el compose referencia .env.production por defecto
APP_ENV_FILE=.env.local docker compose --env-file .env.local up -d db
npm install
npx prisma migrate dev
npm run db:seed
npm run dev                     # http://localhost:3000
```
