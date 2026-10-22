# Migración técnica de v2.3 a v2.4

> Guía paso a paso y reproducible. Complementa la sección «De v2.3 a v2.4» de [`manual_docker_debian.md`](../manual_docker_debian.md#actualizar-a-una-nueva-versión), que resume lo que cambia para quien usa la app.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production` (alias del manual).

**Estado:** cerrada (v2.4.0). **Migración:** `20270401080000_v2_4_features`. **Variables nuevas:** ninguna. **Dependencias de ejecución nuevas:** ninguna.

## 1. Qué cambia

| Ámbito | Cambio |
|---|---|
| Base de datos | Tabla nueva `FvSeries` (entradas del perfil fuerza-velocidad), índice `FvSeries_userId_date_idx` y clave foránea a `User` con `ON DELETE CASCADE`. **Solo añade**: no toca tablas ni datos existentes. |
| Aplicación | Pestaña «Perfil F-V» (`/training/tests/perfil-fv`, API `api/training/tests/fv`), «Sugerir fotogramas» (experimental, apagado por defecto), reglas `fast-cap` y `jump-cap` para la familia combinadas, auditoría del cambio de rol del staff (`COACH_SCOPES_CHANGED`). |
| Exportar / restaurar | Incluye `fvSeries`. |
| Privacidad | El perfil F-V no va a la IA ni lo ve la entrenadora. |

SQL de la migración (resumen): `CREATE TABLE "FvSeries"` (`id`, `userId`, `date`, `bodyMassKg`, `hpoCm`, `loads` JSONB, `createdAt`) · `CREATE INDEX` · `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`.

Como solo añade, **la imagen de v2.3 sigue funcionando con la BD ya migrada**: la vuelta atrás no exige deshacer nada.

## 2. Requisitos previos

1. Producción en v2.3.x y sin migraciones pendientes (comprobación en el paso 5.1).
2. `.env.production` válido: en producción la app no arranca con `AUTH_SECRET` corto o de ejemplo, `AUTH_URL` público sin `https://` o la contraseña de BD de ejemplo (validación en `src/lib/env.ts`).
3. Espacio libre para la copia previa (`./backups-pre-update/`). Para cifrarla: `age` instalado y `BACKUP_AGE_RECIPIENT` definido.
4. Ventana corta: la `web` se reemplaza al final; la BD sigue disponible durante toda la actualización.

## 3. Ensayo previo (entorno de desarrollo, no en producción)

`snapshot.sh` y `test-migration.sh` son scripts **de desarrollo**: leen `.env.local` y trabajan con `/tmp`. No se ejecutan en el servidor de producción; sirven para comprobar la migración sobre una copia antes de publicar.

```bash
set -a; . ./.env.local; set +a
sh scripts/dev/snapshot.sh                 # foto de la BD antes del esquema nuevo → /tmp/atlenza-before.dump
# Si la migración ya está aplicada en esa BD de desarrollo, deja la foto como estaba antes de ella:
sh scripts/dev/snapshot.sh --before 20270401080000_v2_4_features
sh scripts/dev/test-migration.sh           # aplica la migración sobre una COPIA con datos sintéticos
```

Criterio de éxito: la última línea es `OK migración`, las líneas `antes:` y `después:` (recuentos y huellas de sesiones y series) son idénticas y el esquema resultante coincide con `prisma/schema.prisma` (diff vacío). Con `--sin-sinteticos` no se cargan los datos sintéticos de `scripts/dev/synthetic-data.sql`.

Resultado registrado al cerrar v2.4 (17/10/2026): `OK`, con 120 sesiones sintéticas, recuentos y huellas idénticos; solo se añade `FvSeries`.

## 4. Actualización en producción

### 4.1 Recomendado: script de actualización

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

En orden: copia de la BD en `./backups-pre-update/` (cifrada si hay `BACKUP_AGE_RECIPIENT`) → etiqueta la imagen actual como `lifeos-web:previous` → `git pull` de `main` → construye la imagen nueva con la web vieja aún activa → migraciones → arranca la `web` nueva → espera al healthcheck. **Si algo falla, vuelve sola a la versión anterior.**

### 4.2 Manual (equivalente, sin vuelta atrás automática)

```bash
cd <RUTA_DE_LA_APP>
mkdir -p backups-pre-update
dc exec -T db pg_dump -U lifeos -d lifeos -Fc > backups-pre-update/pre-v2-4.dump   # umask 077 recomendado
git pull
dc --profile tools run --rm --build migrate
dc up -d --build web
docker image prune -f
```

## 5. Verificación posterior

1. Migraciones aplicadas y ninguna pendiente:
   ```bash
   dc --profile tools run --rm migrate npx prisma migrate status
   ```
   Debe terminar con «Database schema is up to date» e incluir `20270401080000_v2_4_features`.
2. La tabla existe, vacía:
   ```bash
   dc exec db psql -U lifeos -d lifeos -c '\d "FvSeries"' -c 'select count(*) from "FvSeries"'
   ```
3. Estado del contenedor y salud:
   ```bash
   dc ps
   dc logs --tail=100 web
   ```
   `web` debe figurar como *healthy* y no deben aparecer errores de configuración al arrancar.
4. En la app: *Estado del servidor* (Ajustes → administración) muestra la versión 2.4.0 y ninguna migración pendiente · **Tests** muestra «Perfil F-V» y carga sin error · tras cambiar el rol de un miembro del staff de un club, su Actividad registra el cambio.
5. Si una pantalla pide «recargar la página», Ctrl+F5 (caché del navegador con la versión anterior).

## 6. Vuelta atrás

- **Aplicación (lo normal):** `update.sh` ya lo hace si falla. A mano:
  ```bash
  docker image tag lifeos-web:previous lifeos-web:latest
  dc up -d web
  ```
  La BD migrada es compatible con v2.3 (la tabla `FvSeries` simplemente no se usa). Los datos F-V ya introducidos se conservan para cuando se vuelva a v2.4.
- **Base de datos (solo ante corrupción de datos):** restaurar la copia de `backups-pre-update/` con `pg_restore` sobre una BD vacía; se pierde todo lo escrito desde la copia. Si está cifrada, descifrar antes con `age -d -i <FICHERO_DE_CLAVE>`. Probar siempre primero en una BD aparte.

## 7. Variables de entorno y dependencias

- **Variables:** ninguna nueva. No es necesario editar `.env.production`.
- **Dependencias de ejecución:** ninguna nueva. El análisis de fotogramas se hace en el navegador (el vídeo no sale de él).
- **Licencias:** `node scripts/third-party-notices.mjs --check` (347 dependencias OK al cerrar v2.4).

## 8. Referencias

- Migración: `prisma/migrations/20270401080000_v2_4_features/migration.sql`.
- Scripts: `scripts/update.sh`, `scripts/dev/snapshot.sh`, `scripts/dev/test-migration.sh`.
- Copias y restauración en producción: [`servidor-backups.md`](servidor-backups.md).
- Cambios de la versión: [`CHANGELOG.md`](../CHANGELOG.md).
