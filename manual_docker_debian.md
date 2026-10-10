# Atlenza — Despliegue con Docker en Debian

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
- Opcional: una clave de Gemini (`GEMINI_API_KEY`) para Atlenza IA. Sin ella, todo lo demás funciona.

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
| `SCHEDULER_ENABLED` | `true`: cobra suscripciones a diario, genera el informe semanal del coach (solo a quien activó la IA) y manda los recordatorios push (citas, plazos y «Entreno sola», que se revisa cada 5 min) |
| `UPLOAD_QUOTA_MB` | Espacio de apuntes por usuario (por defecto 200) |
| `TOTP_ENCRYPTION_KEY` | El generado arriba. Cifra los secretos de la verificación en dos pasos. **Guárdalo con tus copias**: si se pierde, quien tenga 2FA tendrá que desactivarla con `npm run user -- disable-2fa` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Notificaciones push (opcional). `VAPID_SUBJECT=mailto:tu@email`. Si cambian las claves, cada dispositivo debe volver a activar las notificaciones |
| `WEB_LOG_DRIVER` | `journald` en Debian (lo necesita fail2ban, § 6); `json-file` en Docker Desktop |
| `BACKUP_AGE_RECIPIENT` | Clave **pública** de age para el servicio de copias (§ 8). Opcional |
| `WEB_BIND` / `WEB_PORT` | `127.0.0.1` / `3000` (detrás de Caddy) |
| `GEMINI_API_KEY` | Tu clave (opcional) |
| `GEMINI_CHAT_MODEL` | Modelo de chat disponible en tu cuenta de Google AI |
| `GEMINI_EMBEDDING_MODEL` / `GEMINI_EMBEDDING_DIM` | **No los cambies** tras subir apuntes: la columna es `vector(768)` y habría que re-vectorizar |
| `OFF_USER_AGENT` | `"Atlenza/1.0 (tu-email@dominio.es)"` (OpenFoodFacts lo exige; entre comillas por los paréntesis) |
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

# 2. Migraciones + seed (extensión vector, todas las tablas, índice HNSW,
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
# 2. Filtro y jail de Atlenza
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
# v1.9 · acceso solo con permiso
dc --profile tools run --rm migrate npm run user -- invite ana@correo.es --role ATHLETE --days 7   # enlace de un solo uso
dc --profile tools run --rm migrate npm run user -- suspend ana@correo.es          # no puede entrar; sus datos se conservan
dc --profile tools run --rm migrate npm run user -- reactivate ana@correo.es
```

Desde la v1.9, lo diario se hace en el **panel de administración** (`/admin`, con 2FA o llave): invitar, revocar invitaciones, suspender y reactivar cuentas y generar un **enlace de contraseña nueva** (1 hora, un solo uso) para quien la olvide. No hay emails: el enlace lo copias y se lo das por un canal privado.

Cada usuario puede, en **Ajustes**: cambiar su contraseña y su email, activar la verificación en dos pasos, ver su actividad reciente, activar notificaciones, cerrar sesión en todos sus dispositivos, elegir qué ve su entrenador, descargar sus datos y borrar su cuenta.

### Actualizar a una nueva versión

Desde la v1.2, con un solo comando:

```bash
cd /opt/lifeos
./scripts/update.sh
```

Hace, en orden:
1. Copia de la BD, en `./backups-pre-update/` (cifrada si `BACKUP_AGE_RECIPIENT` está definido y tienes `age`).
2. Guarda la imagen actual como `lifeos-web:previous`.
3. `git pull` de `main`.
4. Construye la imagen nueva **con la web vieja aún funcionando**.
5. Aplica la configuración de la BD si cambió.
6. Migraciones.
7. Arranca la `web` nueva.
8. Espera a que el healthcheck diga *healthy*.
9. Actualiza el servicio de copias si está en marcha. **Si algo falla, vuelve sola a la versión anterior** y te dice qué mirar. Las migraciones son siempre aditivas, así que la versión anterior funciona con la BD ya migrada.

A mano (equivalente, sin vuelta atrás automática):

```bash
git pull
dc --profile tools run --rm --build migrate
dc up -d --build web
docker image prune -f
```

#### De v1.8 a v1.9 (Atlenza: uso solo con permiso, IA propia de cada usuario y vigilancia interna)

**Lo que cambia para quien usa la app:**
- El nombre visible pasa a ser **Atlenza**. No cambian la base de datos (`lifeos`), los volúmenes, las cookies ni las variables `LIFEOS_*`: no se pierde nada ni se cierra ninguna sesión.
- **Condiciones de uso:** al entrar, cada cuenta (salvo ADMIN y demos) ve una pantalla para aceptarlas una vez.
- **Registro solo por invitación** (si `ALLOW_REGISTRATION` no es `true`): desde el panel `/admin` o con `npm run user -- invite`. El enlace es de un solo uso y caduca.
- **IA propia:** cada persona pone su clave en *Ajustes → IA* (Google, OpenAI o compatible, Anthropic o un modelo local). La clave del servidor `GEMINI_API_KEY` pasa a ser **opcional**: si la dejas, sirve de respaldo para quien no tenga la suya. Quien cambie de proveedor tiene que volver a dar el permiso de IA.

**Antes de actualizar:**
- **`AUTH_URL` debe ser la URL pública con https** (p. ej. `https://atlenza.tudominio.es`): con ella se construyen los enlaces de invitación y de contraseña nueva. Si está vacía, los enlaces salen relativos y tendrás que añadir el dominio a mano.
- Lee la `LICENSE`: desde la v1.9 el programa es «todos los derechos reservados»; instalarlo requiere permiso escrito del autor.

**Base de datos:**
- Una migración: `v1_9_features`.
- **Crea** las tablas `Invitation`, `PasswordReset` y `AiCredential`; añade `User.suspendedAt` y valores nuevos al registro de seguridad.
- **Índice único parcial** para los ejercicios globales (`Exercise_global_name_key`). Si hubiera dos ejercicios globales con el mismo nombre (solo posible con dos *seeds* a la vez), sus series, marcas y alias pasan al más antiguo y el duplicado se borra. Es el único cambio que toca datos y se ha probado sobre una copia de la v1.8 con un duplicado provocado.

```bash
cd /opt/lifeos
./scripts/update.sh
```

**Variables nuevas** (todas opcionales):

| Variable | Para qué |
|---|---|
| `AI_LOCAL_BASE_URLS` | URL de modelos locales que los usuarios pueden elegir, separadas por comas. Ej.: `http://ollama:11434/v1` si Ollama está en la misma red de Docker, o `http://host.docker.internal:11434/v1` si corre en el host (añade `extra_hosts: ["host.docker.internal:host-gateway"]` al servicio `web`). Cualquier otra URL que ponga un usuario debe ser https y pública. |
| `TELEGRAM_BOT_TOKEN` y `TELEGRAM_ADMIN_CHAT_ID` | Avisos de la vigilancia interna por Telegram: copias fallidas, BD lenta, cola con fallos, poco disco o picos de errores, y cuándo se resuelven. Crea el bot con @BotFather; tu chat id sale en `https://api.telegram.org/bot<TOKEN>/getUpdates` tras escribirle. |

**Vigilancia de la web caída** (la app no puede avisar si está caída). Añade al cron del usuario que despliega:

```bash
crontab -e
# cada 5 minutos; avisa al segundo fallo seguido y cuando vuelve
*/5 * * * * cd /opt/lifeos && sh scripts/watchdog.sh >/dev/null 2>&1
```

Lee `TELEGRAM_*`, `WEB_BIND` y `WEB_PORT` de `.env.production`. Sin Telegram configurado no envía nada.

**Conexiones salientes nuevas:**
- Las del proveedor de IA que elija cada usuario, solo con su permiso. Un modelo local no sale del servidor.
- `api.telegram.org`, solo si configuras Telegram, y solo con el texto del aviso (sin datos de usuarios).

**Comprobar que todo fue bien:**
- `dc ps`: `web` y `db` **healthy**.
- **Ajustes → Estado del servidor**: `v1.9.0` y la migración `20261115080000_v1_9_features`.
- **`/admin` → Métricas y vigilancia**: «todo en orden» y, si configuraste Telegram, «Los avisos llegan por Telegram».
- Prueba una invitación: créala en `/admin`, ábrela en una ventana privada y comprueba que pide aceptar las condiciones.
- Si usas `scripts/watchdog.sh`, para la web un momento (`dc stop web`), espera 10 min y arráncala (`dc start web`): deben llegarte el aviso y la recuperación.

#### De v1.7 a v1.8 (calidad, experiencia de uso y 12 funcionalidades)

**Antes de actualizar: la cuenta ADMIN necesita 2FA o una llave de acceso.**
- Desde la v1.8, **Estado del servidor** y `/api/admin/*` exigen además del rol ADMIN un segundo factor.
- Si tu cuenta no lo tiene, Ajustes te lo dice y no verás la administración hasta activarlo.
- Actívalo antes: **Ajustes → Seguridad (2FA)** o **Ajustes → Llaves de acceso** (las llaves necesitan HTTPS).
- Si ya lo tienes, no hace falta nada.

**Base de datos:**
- Una migración, **solo aditiva**: `v1_8_features`.
- **Crea** tablas: `PageUsage`, `ServerError`, `RateLimitHit`, `TrashItem`, `WeeklyReview`, `Goal` y `CategoryRule`.
- **Añade columnas opcionales:** primer uso (`User.onboardedAt`), título, texto, enlace, leída y pospuesta de las notificaciones, coordenadas de los eventos y «compartida» de las plantillas.
- No borra ni cambia datos. Se ha probado sobre una copia de una BD v1.7 con datos: usuarios, sesiones, plan y movimientos idénticos antes y después, y sin diferencias con el esquema.

```bash
cd /opt/lifeos
./scripts/update.sh
```

**Qué hace `update.sh` en la v1.8:**
- Lo mismo que en la v1.7.
- Además, pasa el commit actual a la imagen (`GIT_SHA`) para que **Estado del servidor** diga qué versión del código corre y si hay una más nueva en GitHub.
- La BD no se reinicia (su configuración no cambia).

**Variables:** **ninguna obligatoria.**

| Variable | Por defecto | Para qué |
|---|---|---|
| `GIT_SHA` | la pone `update.sh` | Commit de la imagen. No la pongas a mano. |
| `UPDATE_REPO` | `Kirito8888/AtleticHomeDesing` | Repositorio donde mirar si hay versión nueva (solo si usas un fork). |
| `RETENTION_SERVER_ERRORS_DAYS` | `30` | Días que se guardan los errores del servidor y los informes de la CSP. |
| `RETENTION_PAGE_USAGE_DAYS` | `365` | Días que se guarda el contador de uso local. |

**Conexiones salientes nuevas:**
- `api.github.com`: comprobación de versión, una vez cada 6 h, desde Estado del servidor. Solo pide el último commit de `main`; no envía nada tuyo.
- `api.open-meteo.com`: ya se usaba en la v1.5. Ahora también para el pronóstico del día de la competición, solo si guardas las coordenadas del estadio.

**Comprobar que todo fue bien:**
- `dc ps`: `web` y `db` deben salir **healthy**.
- **Ajustes → Estado del servidor** debe decir:
  - `v1.8.0`;
  - última migración `v1_8_features`;
  - «Versión del código» con el commit;
  - «Errores recientes» vacío o casi;
  - **«Revisar ahora»** de la integridad → «Todo en orden».
- La **campana** aparece arriba; el aviso de tu último inicio de sesión ya está dentro.
- **Ajustes → Notificaciones:** pon tus horas de silencio.
- **Compartir con Atlenza:** en Android, reinstala la app desde Chrome (menú → «Instalar aplicación») para que aparezca en el menú «Compartir».

#### De v1.6 a v1.7 (seguridad, privacidad, menos recursos y 30 funcionalidades)

**Base de datos:**
- Una migración, **solo aditiva**: `v1_7_features`.
- **Crea** tablas: `Passkey`, `WebAuthnChallenge`, `Consent`, `PrivacyRequest`, `RoutineProfile`, `RoutineTest`, `WellbeingLog`, `InjuryPhoto`, `MealPlanEntry`, `SupplementLog`, `SweatTest`, `Assignment`, `SeasonBudget`, `Receipt` y `SubscriptionPriceChange`.
- **Añade columnas opcionales:**
  - huella encadenada del registro de actividad;
  - etiquetas de la sesión;
  - días de cada suplemento;
  - limitación del tratamiento;
  - marca de cuenta demo.
- No borra ni cambia datos. Se ha probado sobre una copia de una BD v1.6 con datos: usuarios, sesiones y plan idénticos antes y después, y sin diferencias con el esquema.

```bash
cd /opt/lifeos
./scripts/update.sh
```

**Qué hace `update.sh` en la v1.7:**
1. Copia previa de la BD.
2. `git pull`.
3. **Construye la imagen nueva con la web vieja aún funcionando.** Si el build falla, no toca nada.
4. **Aplica la configuración nueva de la base de datos:**
   - la imagen pasa de `pgvector/pgvector:pg17` a la fijada `0.8.7-pg17-bookworm` (misma versión 17: los datos valen tal cual);
   - entran el límite de memoria y los ajustes de Postgres;
   - por eso **la BD se reinicia una vez, unos segundos**;
   - si no arranca, vuelve a la configuración anterior y se detiene.
5. Migraciones.
6. Web nueva. Antes borra los contenedores `web` huérfanos que provocaron el «Conflict» de la v1.6.
7. Healthcheck, con vuelta atrás automática si falla.
8. Si el servicio de copias está en marcha, lo reconstruye: ahora incluye `rsync` y `ssh`.

**Variables:** **ninguna obligatoria.** Todas tienen un valor por defecto prudente para un servidor pequeño. Si quieres, añádelas a `.env.production`:

| Variable | Por defecto | Para qué |
|---|---|---|
| `WEB_MEM` / `WEB_HEAP_MB` / `WEB_CPUS` | `1g` / `640` / `1.5` | Límite de la web. Si la máquina tiene 2 GB o menos, prueba con `768m` / `480`. |
| `DB_MEM` / `DB_CPUS` | `768m` / `1.0` | Límite de Postgres. |
| `PG_SHARED_BUFFERS`, `PG_EFFECTIVE_CACHE`, `PG_WORK_MEM`, `PG_MAINTENANCE_WORK_MEM`, `PG_MAX_CONNECTIONS`, `PG_SLOW_MS` | `128MB`, `384MB`, `4MB`, `64MB`, `30`, `1000` | Ajustes de Postgres. Con `PG_SLOW_MS`, las consultas de más de 1 s quedan en `dc logs db`. |
| `DB_POOL_MAX` | `5` | Conexiones de la app a la BD (deben ser menos que `PG_MAX_CONNECTIONS`). |
| `BACKUP_KEEP_MONTHS` | `12` | Meses que se guarda la copia del día 1 de cada mes. |
| `BACKUP_REMOTE` + `BACKUP_SSH_KEY_FILE` | vacío | Copia fuera del servidor (más abajo). |
| `RETENTION_AUDIT_DAYS`, `RETENTION_SAFETY_TRIPS_DAYS`, `RETENTION_NOTIFICATIONS_DAYS`, `RETENTION_EXPIRED_LINKS_DAYS`, `RETENTION_PRIVACY_REQUESTS_DAYS` | 180, 90, 60, 30, 1095 | Plazos de conservación (borrado automático diario). |
| `LEGAL_NAME`, `LEGAL_EMAIL`, `LEGAL_NIF`, `LEGAL_ADDRESS` | vacío | Responsable que aparece en `/legal/privacidad` y `/legal/aviso`. Sin ellas, esas páginas lo dicen. |
| `DATA_ENCRYPTION_KEY_PREVIOUS`, `TOTP_ENCRYPTION_KEY_PREVIOUS` | vacío | **Solo al rotar claves** (más abajo). |

**Antes de actualizar, tres cosas:**
- **Llaves de acceso (passkeys):**
  - solo funcionan con **HTTPS** y con `AUTH_URL` igual a tu dirección pública exacta (p. ej. `https://tuapp.duckdns.org`, sin barra final);
  - si `AUTH_URL` sigue en `http://localhost:3000`, la contraseña funciona igual, pero las llaves no.
- **Contenedor `web` de solo lectura:**
  - solo escribe en `/tmp`, en la caché de Next (en memoria) y en el volumen de subidas;
  - si has añadido a mano otros volúmenes o rutas de escritura al servicio `web`, revísalos.
- **Primera entrada tras actualizar:** tu contraseña se vuelve a guardar sola con Argon2id. No tienes que hacer nada.

**Copia fuera del servidor (opcional, recomendado):**
1. Crea una clave solo para esto:
   ```bash
   ssh-keygen -t ed25519 -N "" -f /opt/lifeos/backup_ssh_key
   ```
2. Copia `backup_ssh_key.pub` al `~/.ssh/authorized_keys` de la otra máquina (un NAS, otro VPS…).
3. En `.env.production`:
   ```bash
   BACKUP_REMOTE=usuario@otra-maquina:/ruta/copias-lifeos
   BACKUP_SSH_KEY_FILE=/opt/lifeos/backup_ssh_key
   ```
4. Reinicia el servicio:
   ```bash
   dc --profile backup up -d --build backup
   dc --profile backup logs --tail 5 backup   # debe decir que envió las copias
   ```
- Las copias ya van cifradas con `age`: la otra máquina no puede leerlas.

**Rotar las claves de cifrado (cuando quieras, no hace falta para actualizar):**
1. Mueve la clave actual a `DATA_ENCRYPTION_KEY_PREVIOUS` (y, si la usas, `TOTP_ENCRYPTION_KEY` a `TOTP_ENCRYPTION_KEY_PREVIOUS`).
2. Pon una nueva (`openssl rand -base64 32`) y ejecuta `dc up -d web`.
3. **Ajustes → Estado del servidor → «Volver a cifrar con la clave nueva»**. Debe salir 0 «sin poder abrir».
4. Quita las `*_PREVIOUS` y ejecuta otra vez `dc up -d web`.
- **Guarda la clave nueva en tu gestor de contraseñas antes de borrar la vieja.**

**Comprobar que todo fue bien:**
- `dc ps`: `web` y `db` deben salir **healthy**.
- **Ajustes → Estado del servidor** debe decir:
  - `v1.7.0`;
  - base de datos OK;
  - última migración `v1_7_features`.
- **Ajustes → Actividad reciente** debe decir «Registro íntegro».
- **Ajustes → Llaves de acceso:** añade la del móvil.
- **Ajustes → Privacidad y derechos:** revisa consentimientos y plazos.
- Si quieres ver cómo la usaría otra persona: **Estado del servidor → Cuentas de demostración**. Se borran solas a los 30 días.
- Uso de recursos: `docker stats --no-stream` (la columna LIMIT ya no debe decir el total de la máquina).

Detalles en [`docs/guia-usuario.md`](docs/guia-usuario.md). Si otras personas van a usar tu servidor, tienes las plantillas RGPD en [`docs/rgpd/`](docs/rgpd/) y el plan de incidentes en [`docs/seguridad-incidentes.md`](docs/seguridad-incidentes.md).

#### De v1.5 a v1.6 (mujeres, kg del día, plan inteligente, jabalina, salud, cocina, estudio, viajes…)

Una migración, **solo aditiva**: `v1_6_features` **crea** tablas (`HealthReport`, `SafetyContact`, `SafetyTrip`, `Minimum`, `WeekTemplate`, `PrehabRoutine`, `PrehabLog`, `BodyMeasure`, `Supplement`, `Appointment`, `Recipe`, `ShoppingItem`, `StudyPlanBlock`, `Grade`, `Trip`, `Deadline`) y **añade columnas opcionales** (afinamiento del día del plan, clave técnica, fatiga por zona, id del registro sin conexión, hierro, viaje del gasto, kg sugerido). No borra ni cambia datos: probada sobre una copia de una BD v1.5 con datos (días del plan y sesiones idénticos antes y después; sin diferencias con el esquema).

```bash
cd /opt/lifeos
./scripts/update.sh          # copia previa → pull → migrate → build → healthcheck (vuelta atrás si falla)
```

**Variables:** ninguna nueva.

- Los informes para tu médica o tu fisio y «Entreno sola» usan la misma clave de cifrado que «Mi ciclo» (`DATA_ENCRYPTION_KEY` o, si no está, `TOTP_ENCRYPTION_KEY`). **No la cambies.**
- Los enlaces de los informes se construyen con `AUTH_URL`: debe ser tu dirección pública (la de DuckDNS), no `localhost`, o el enlace no le funcionará a quien lo reciba.
- «Entreno sola» y los plazos avisan por **push**: el planificador debe estar activo (`SCHEDULER_ENABLED=true`) y quien recibe el aviso necesita la app instalada con las notificaciones activadas. No hay SMS ni email.

**Comprobar que todo fue bien:** **Ajustes → Estado del servidor** debe decir `v1.6.0`, base de datos OK y la última migración `v1_6_features`. Después, en la app (todo opcional):

- **Ajustes → Mis reglas:** tope de los kg del día, afinamiento (días y %), semáforo y plan de estudio;
- **Recuperación → Salud de la mujer** (cribado óseo, enlace para tu médica, «Entreno sola» y su contacto);
- **Entreno → Jabalina** (mínimas) y **Entreno → Prehab**;
- **Atlenza IA → Exámenes y notas**; **Finanzas → Viajes y plazos**;
- **Ajustes → Calendario** si quieres tus clases y exámenes en el `.ics`.

Detalles en [`docs/guia-usuario.md`](docs/guia-usuario.md).

#### De v1.4 a v1.5 (salud de la mujer, carga, plan propio, estudio, material…)

Dos migraciones, **solo aditivas**:

- `v1_5_features` **crea** tablas (`WomenHealth`, `HealthLog`, `TestResult`, `ReturnProtocol`, `ClassSlot`, `StudySession`, `Habit`, `HabitLog`, `Equipment`, `HydrationLog`, `SessionComment`) y **añade columnas opcionales** (condiciones meteorológicas en la sesión técnica, velocidad por serie);
- `v1_5_backup_log` **crea** `BackupRun`, donde el servicio de copias apunta cada copia para verla en la app.

No borran ni cambian datos. Probadas sobre una copia de una BD v1.4 con datos (usuarios, sesiones y plan intactos; sin diferencias con el esquema después).

```bash
cd /opt/lifeos
./scripts/update.sh          # copia previa → pull → migrate → build → healthcheck (vuelta atrás si falla)
```

**Variables:** ninguna obligatoria nueva.

- Los datos de «Salud de la mujer» se cifran con la misma clave que «Mi ciclo» (`DATA_ENCRYPTION_KEY` o, si no está, `TOTP_ENCRYPTION_KEY`). **No cambies esa clave** si ya hay datos del ciclo: lo cifrado con una clave no se puede leer con otra.
- Las condiciones de la pista usan Open-Meteo (sin clave). Si el servidor no tiene salida a internet, simplemente no se guardan.

**Copias:** si usas el servicio `backup`, reconstrúyelo para que apunte cada copia en la BD (la tarjeta «Estado del servidor» lo enseña):

```bash
dc --profile backup up -d --build backup
dc --profile backup logs --tail 5 backup   # debe terminar en «[backup] ok …»
```

**Comprobar que todo fue bien:** con una cuenta de administrador (si hace falta: `dc --profile tools run --rm migrate npm run user -- set-role tu@correo ADMIN` y vuelve a iniciar sesión), **Ajustes → Estado del servidor** debe decir `v1.5.0`, base de datos OK, la última migración terminada en `v1_5_backup_log` y, tras la siguiente copia, la fecha de la última copia.

Después, en la app (todo opcional):

- **Ajustes → Mi pista** (coordenadas para el tiempo) y **Mis reglas** (monotonía, sueño, agua, VBT);
- **Recuperación → Salud de la mujer** (si aplica);
- **Atlenza IA → Horario y exámenes**;
- **Entreno → Material**.

Detalles en [`docs/guia-usuario.md`](docs/guia-usuario.md).

#### De v1.3 a v1.4 (crear plan con IA, reglas, competición…)

La migración `v1_4_features` solo **crea** tablas (`PlanFeedback`, `CycleProfile`, `CycleLog`, `OneRepMax`, `ExerciseAlias`, `CalendarFeed`, `SharedReport`) y **añade columnas opcionales** (preferencias, control rápido, vídeo contado, sensaciones, gasto deportivo, origen y estado del plan). No borra ni cambia datos. Probada sobre una copia de una BD v1.3 con datos y plan importado.

```bash
cd /opt/lifeos
./scripts/update.sh          # copia previa → pull → migrate → build → healthcheck (vuelta atrás si falla)
```

**Variables:** ninguna obligatoria.

- `DATA_ENCRYPTION_KEY` (opcional): clave propia para los datos del ciclo menstrual. Si no está, se usa `TOTP_ENCRYPTION_KEY`, que ya tienes. **Si decides ponerla, hazlo antes de usar «Mi ciclo»**: lo cifrado con una clave no se puede leer con otra.
- `LIFEOS_FAKE_AI`: **no la pongas en producción** (solo sirve para la CI).
- «Crear plan con IA» usa la `GEMINI_API_KEY` que ya tengas y el consentimiento de IA de cada usuario.

Después, en la app: **Ajustes → Mis reglas** (umbrales de los avisos) y, si quieres, **Ajustes → Notificaciones → recordatorios**, **Calendario en el móvil** e **Informe para la entrenadora**. Detalles en [`docs/guia-usuario.md`](docs/guia-usuario.md).

> **Desde v1.2 o v1.1:** las migraciones son acumulativas y aditivas: `update.sh` (o el procedimiento a mano de v1.1) aplica v1.3, v1.4, v1.5, v1.6 y v1.7 juntas.

#### De v1.2 a v1.3 (importar la planificación)

La migración `v1_3_plan_import` solo **crea** dos tablas (`PlanMeso`, `PlanDay`): no toca datos existentes. Probada sobre una copia de una BD v1.2 con datos. No hay variables nuevas.

```bash
cd /opt/lifeos
./scripts/update.sh          # copia previa → pull → migrate → build → healthcheck (vuelta atrás si falla)
```

Después, en la app: **Planificación → icono de subir (Importar plan)** → elige el `.zip` del plan (o sus PDF «día a día») → revisa la vista previa → **Importar**. Los PDF no se guardan en el servidor; solo el plan ya ordenado por días. Detalles en [`docs/guia-usuario.md`](docs/guia-usuario.md#importar-tu-planificación).

> **Si tu servidor sigue en v1.1:** haz primero el paso 1 de «De v1.1 a v1.2» (variables nuevas en `.env.production`) y actualiza **a mano** una vez (`update.sh` aún no existe en v1.1): `git pull`, `dc --profile tools run --rm --build migrate`, `dc up -d --build web`. Las migraciones de v1.2 y v1.3 se aplican juntas. A partir de ahí, `./scripts/update.sh`.

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
5. **Atlenza IA queda desactivado** para todos hasta que cada usuario lo autorice en *Ajustes → Privacidad e IA*.

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
| Atlenza IA: "no está configurado" | Falta `GEMINI_API_KEY` | Añádela y ejecuta `dc up -d web` |
| Atlenza IA: "Activa el consentimiento de IA" | El usuario no ha autorizado el envío a Gemini | *Ajustes → Privacidad e IA* |
| Login: "Demasiados intentos" | 5 fallos seguidos en la cuenta (bloqueo de 15 min) o 10 intentos desde la misma IP en 15 min | Espera, o `npm run user -- unlock <email>` (§ 8). Si **todos** los usuarios ven el aviso a la vez, tu proxy no envía `X-Forwarded-For` y todos comparten IP |
| `/register` dice "Registro cerrado" | `ALLOW_REGISTRATION=false` y ya existe algún usuario | Crea la cuenta con `npm run user -- create` |
| Perdí el móvil con la app de 2FA y los códigos de recuperación | — | `npm run user -- disable-2fa <email>` (también cierra sus sesiones) |
| "La verificación en dos pasos no está configurada" | Falta `TOTP_ENCRYPTION_KEY` | Añádela (`openssl rand -base64 32`) y `dc up -d web` |
| No llegan notificaciones | Sin claves VAPID, permiso denegado en el navegador, o iPhone sin la PWA instalada | Ajustes → Notificaciones → *Enviar prueba*. En iOS (16.4+), instala la app en la pantalla de inicio |
| `dc ps` muestra `web` como *unhealthy* | La app no llega a la BD | `dc logs --tail=100 web` y `curl http://127.0.0.1:3000/api/health` |
| Apuntes en "Pendiente" para siempre | La cola de ingesta no arrancó | Busca `[jobs]` en `dc logs web`. Los fallidos se reintentan desde Atlenza IA → *Reintentar* |
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
