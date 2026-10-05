# LifeOS — Despliegue con Docker en Debian

Guía de comandos para levantar la PWA en un servidor Debian 12 (bookworm) o 13 (trixie).
Para la arquitectura interna, ver [`manual_backend.md`](manual_backend.md).

```
Internet ──HTTPS──► Caddy (host, :443) ──► web (Next.js, 127.0.0.1:3000)
                                              │
                                              ▼
                                   db (PostgreSQL 17 + pgvector) ◄── pgadmin (127.0.0.1:5050, vía túnel SSH)
                                   volúmenes: pgdata · uploads · pgadmin
```

| Servicio | Imagen | Puerto en el host | Se arranca con `up` |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg17` | `127.0.0.1:5432` | Sí |
| `web` | Build local (`Dockerfile`, target `runner`) | `127.0.0.1:3000` | Sí |
| `pgadmin` | `dpage/pgadmin4` | `127.0.0.1:5050` | Sí |
| `migrate` | Build local (target `migrate`) | — | No: tarea puntual (perfil `tools`) que aplica migraciones y seed |

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

nano .env.production
```

Valores a revisar:

| Variable | Valor en producción |
|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | `lifeos` (o lo que prefieras) |
| `POSTGRES_PASSWORD` | El generado arriba. Usa hex: sin `@ : / ?`, que romperían la URL de conexión |
| `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` | Tu email y el valor generado arriba |
| `AUTH_SECRET` | El generado arriba. Si cambia, todas las sesiones se cierran |
| `AUTH_URL` | La URL pública **exacta**: `https://lifeos.tudominio.es` |
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

# 3. Aplicación y pgAdmin (la primera vez compila la imagen: unos minutos)
dc up -d --build web pgadmin

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

Comprueba `https://lifeos.tudominio.es`, crea tu cuenta y, desde el móvil, usa **"Añadir a pantalla de inicio" / "Instalar app"**.

**Alternativa con nginx** (si ya lo usas): `proxy_pass http://127.0.0.1:3000;` con `client_max_body_size 20m;` y `proxy_set_header Host $host; X-Forwarded-Proto $scheme;`, y certificado con `certbot --nginx`.

---

## 7. pgAdmin

Está ligado a `127.0.0.1:5050`. Accede desde tu ordenador con un túnel SSH:

```bash
ssh -L 5050:127.0.0.1:5050 usuario@tu-servidor
# y abre http://localhost:5050 en tu navegador
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

### Actualizar a una nueva versión

```bash
cd /opt/lifeos
git pull
dc --profile tools run --rm --build migrate   # aplica migraciones nuevas (si las hay)
dc up -d --build web
docker image prune -f                         # limpia imágenes antiguas
```

### Copias de seguridad

Con la base de datos y los apuntes subidos basta (los volúmenes se llaman `lifeos_pgdata`, `lifeos_uploads` y `lifeos_pgadmin`):

```bash
sudo mkdir -p /var/backups/lifeos && sudo chown "$USER": /var/backups/lifeos
cd /opt/lifeos

# Base de datos (formato custom, comprimido)
dc exec -T db pg_dump -U lifeos -d lifeos -Fc > /var/backups/lifeos/db-$(date +%F).dump

# Apuntes subidos
docker run --rm -v lifeos_uploads:/data:ro -v /var/backups/lifeos:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Copia diaria automática a las 03:30, conservando 14 días (`crontab -e`):

```cron
30 3 * * * cd /opt/lifeos && docker compose --env-file .env.production exec -T db pg_dump -U lifeos -d lifeos -Fc > /var/backups/lifeos/db-$(date +\%F).dump && find /var/backups/lifeos -name 'db-*.dump' -mtime +14 -delete
```

Guarda también una copia **fuera del servidor** (`rclone`, `rsync` a otra máquina…), además de `.env.production`. Sin `AUTH_SECRET` las sesiones se invalidan; sin `POSTGRES_PASSWORD` no podrás conectar con el volumen existente.

### Restaurar

```bash
dc stop web
dc exec -T db pg_restore -U lifeos -d lifeos --clean --if-exists < /var/backups/lifeos/db-AAAA-MM-DD.dump
docker run --rm -v lifeos_uploads:/data -v /var/backups/lifeos:/backup alpine \
  sh -c "cd /data && tar xzf /backup/uploads-AAAA-MM-DD.tgz"
dc up -d web
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
