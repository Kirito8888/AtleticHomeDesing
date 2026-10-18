# Copias de seguridad en el servidor físico

Tres scripts en `scripts/ops/` para proteger los datos de la atleta. No paran contenedores, no tocan la app, Docker, SSH ni el cortafuegos.

| Script | Para qué |
|---|---|
| `backup-lifeos.sh` | `pg_dump` desde el contenedor `lifeos-db-1` → gzip → (age) → `.sha256` → rotación a 14 días |
| `verify-backup.sh` | Comprueba una copia sin tocar la BD activa; con `--restore-test` la restaura en una BD temporal |
| `secure-env-permissions.sh` | Deja los `.env*` en modo 600 (solo informa hasta que se pasa `--apply`) |
| `selftest.sh` | Prueba los tres con un Docker simulado (no necesita servidor) |

Todos aceptan `--help` y `--dry-run`. Ninguno lleva contraseñas: `pg_dump` usa las variables `POSTGRES_*` del propio contenedor.

## Relación con el servicio `backup` del compose
`deploy/backup` (perfil `backup`, ver manual § 8) ya hace copia cifrada diaria con **restauración de prueba**, mensuales y copia remota.
**Sigue siendo la opción recomendada.** Estos scripts son la vía «cron del host»: sirven si el servicio no está levantado o como segunda copia independiente.
Pueden convivir (el servicio corre a las 03:30 de Madrid; el cron de abajo a las 04:00 UTC).

## Cifrado (importante)
Un volcado en claro contiene datos de salud. Define `BACKUP_AGE_RECIPIENT` con tu clave **pública** `age1…` (la privada se guarda fuera del servidor):
la copia sale como `.sql.gz.age`. Sin esa variable el script avisa y deja el `.sql.gz` sin cifrar, solo legible por su dueño (600, carpeta 700).

## Instalación
```sh
sudo mkdir -p /var/backups/lifeos && sudo chown "$USER": /var/backups/lifeos && chmod 700 /var/backups/lifeos
bash scripts/ops/backup-lifeos.sh --dry-run      # revisa contenedor, destino y qué rotaría
```
El usuario que lo ejecute debe poder usar `docker` (grupo `docker` o root). Variables: `BACKUP_CONTAINER` (`lifeos-db-1`), `BACKUP_DIR` (`/var/backups/lifeos`), `BACKUP_KEEP_DAYS` (14), `BACKUP_AGE_RECIPIENT`.

## Programar en crontab (diaria 04:00 UTC)
`crontab -e` del usuario con acceso a Docker:
```cron
CRON_TZ=UTC
0 4 * * * cd /opt/lifeos && BACKUP_AGE_RECIPIENT=age1…tuClavePública… bash scripts/ops/backup-lifeos.sh >> /var/backups/lifeos/backup.log 2>&1
30 4 * * 0 cd /opt/lifeos && bash scripts/ops/verify-backup.sh --restore-test >> /var/backups/lifeos/verify.log 2>&1
```
(La segunda línea verifica cada domingo la copia más reciente; si es `.age` añade `BACKUP_AGE_IDENTITY=/ruta/clave-privada`, que debe estar accesible solo para esa tarea.)
`flock` interno evita solapes. Si una copia falla, el script sale con código ≠ 0 y **no rota** nada: revisa el log.

## Copia manual
```sh
bash scripts/ops/backup-lifeos.sh
ls -lh /var/backups/lifeos/
bash scripts/ops/verify-backup.sh                 # la más reciente: sha256, gzip y contenido
bash scripts/ops/verify-backup.sh --restore-test  # además la restaura en una BD temporal que se borra sola
```

## Restauración ante desastre
Una copia que nunca se ha restaurado no es una copia. Ensáyalo con `--restore-test` antes de necesitarlo.

1. **Elige y valida la copia:** `bash scripts/ops/verify-backup.sh /var/backups/lifeos/lifeos-db-AAAAMMDDTHHMMSSZ.sql.gz[.age]`. Si falla, prueba la anterior.
2. **Copia fuera del servidor:** si el disco falló, trae antes la copia de la otra máquina y su `.sha256` (misma carpeta).
3. **Para solo la app** (no la BD): `docker compose --env-file .env.production stop web`.
4. **Red de seguridad:** guarda lo que haya ahora aunque esté roto:
   `docker exec lifeos-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /var/backups/lifeos/antes-de-restaurar.dump`
5. **Base vacía:**
   ```sh
   docker exec lifeos-db-1 sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```
   (Si la BD tiene extensión `vector`, el volcado ya incluye `CREATE EXTENSION`; el rol de `POSTGRES_USER` es superusuario en la imagen oficial.)
6. **Restaurar** (sin `.age` usa `gzip -dc`; con `.age`: `age -d -i clave-privada.txt FICHERO | gzip -dc`):
   ```sh
   gzip -dc lifeos-db-….sql.gz | docker exec -i lifeos-db-1 sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```
7. **Migraciones**, si la copia es de una versión anterior a la desplegada:
   `docker compose --env-file .env.production --profile tools run --rm migrate`
8. **Arranca y comprueba:** `docker compose --env-file .env.production start web`; entra como administradora → *Ajustes → Estado del servidor* (BD OK, última migración correcta) y revisa que están sus últimas sesiones.
9. **Apunta** qué pasó y la hora de la copia usada (se pierde lo posterior a ella).

Los apuntes subidos (volumen `uploads`) **no** van en estos scripts: los cubre el servicio `backup` (manual § 8).

## Permisos de `.env*`
```sh
bash scripts/ops/secure-env-permissions.sh                 # informe (no cambia nada)
bash scripts/ops/secure-env-permissions.sh --apply         # deja 600
bash scripts/ops/secure-env-permissions.sh --apply /opt/lifeos   # solo una ruta
```
Recorre `/opt/lifeos`, `/srv`, `/etc/lifeos` y `$HOME` (o las rutas que indiques), sin seguir enlaces, sin entrar en `node_modules`/`.git`, y salta `.env.example`.
No lee ni cambia el contenido ni el dueño. **Mira la columna del dueño:** con 600 solo ese usuario podrá leerlo; quien lance `docker compose --env-file` o `scripts/update.sh` debe ser él.

## Límites de lo probado
Probado en el contenedor de desarrollo con un `docker` simulado (`bash scripts/ops/selftest.sh`): sintaxis, `--help`/`--dry-run`, copia, rotación, sha256, detección de corrupción y permisos. **No probado contra el Postgres real ni con cron**: la primera ejecución en el servidor debe hacerse a mano, con `--dry-run` y luego `verify-backup.sh --restore-test`.
