# Migración técnica de v2.8 a v2.9

> **Estado: cerrada (v2.9.0, 10/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.8.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** una, `20270701080000_v2_9_features` (aditiva). La anterior sigue siendo `20270602080000_v2_6_study_pack`.
**Dependencias nuevas:** ninguna.
**Variables nuevas:** ninguna.

## 1. Qué cambia en la base de datos

| Tipo | Objeto |
|---|---|
| Extensión | `CREATE EXTENSION IF NOT EXISTS "pg_trgm"` |
| Tablas nuevas | `BodyComposition` (datos cifrados, solo la fecha en claro), `StudySelfTestAttempt`, `StudyMicroSession`; todas con borrado en cascada al borrar la cuenta |
| Columnas nuevas (opcionales) | `StudyPlanBlock.moduleId`, `StudyPlanBlock.topicId`, `StudySession.moduleId`, `StudySession.clientKey` (FK con `SET NULL`) |
| Índices | `SessionComment(athleteId)`, `SessionComment(authorId)`, `SecurityEvent(createdAt)`, `NotificationLog(sentAt)`, GIN `gin_trgm_ops` en `FoodProduct(name)` y `(brand)`, y los de las tablas/columnas nuevas (incluidos los únicos `(userId, clientKey)` y `(userId, moduleId, takenAt)`) |

Sin `DROP`, sin cambios de tipo y sin tocar datos existentes (probado con `scripts/dev/test-migration.sh`: recuentos y huellas iguales antes y después, esquema idéntico a `schema.prisma`).

**Requisitos:**
- La imagen de Postgres debe traer los módulos *contrib* (`pg_trgm`). La de `docker-compose.yml` (`pgvector/pgvector:pg17`) los trae.
- El usuario de la BD debe poder crear la extensión (el propietario de la base puede: `pg_trgm` es de confianza desde Postgres 13).
- **No es reejecutable a mano:** salvo la extensión, las sentencias no llevan `IF NOT EXISTS`. Prisma la aplica una sola vez y lo apunta en `_prisma_migrations`; no la ejecutes con `psql`.
- Los índices se crean sin `CONCURRENTLY` y bloquean escrituras en esas tablas unos instantes; con el tamaño actual es inmediato.

## 2. Actualizar

Copia de seguridad antes (`manual_docker_debian.md`, `docs/servidor-backups.md`):

```bash
cd <RUTA_DE_LA_APP>
bash scripts/ops/backup-lifeos.sh
```

```bash
./scripts/update.sh
```

`update.sh` ejecuta el servicio `migrate` (`dc --profile tools run --rm migrate`, que hace `prisma migrate deploy`) antes de levantar la web. Si la migración falla, vuelve solo a la versión anterior de la web; la BD queda con la migración marcada como fallida.

## 3. Comprobar

```bash
bash scripts/ops/verify-hito-0.sh
```

- *Estado del servidor* muestra la versión 2.9.0, `/api/health` responde ok y no quedan migraciones pendientes.
- `/nutrition/composition` abre y guarda una medición de prueba (puedes borrarla después).
- En una asignatura, «Evaluar nivel»: el intento aparece en «Tus intentos» también desde otro dispositivo. Si tenías resultados solo en el navegador, sale el aviso de importar.
- «Planificar en el calendario» muestra el borrador; tras aceptarlo, los bloques salen en Planificación → «Estudio del día».
- En Estudio → «Pasos», con asignatura: un foco terminado suma minutos en «Horas de estudio» (`/study/focus`).

## 4. Si la migración falla

1. Lee el error en la salida de `update.sh` (o repítelo con `dc --profile tools run --rm migrate`). La causa más probable es la extensión (imagen sin *contrib* o sin permiso).
2. Corrige la causa. Comprueba con `psql` qué objetos de la tabla del paso 1 llegaron a crearse y bórralos, o restaura la copia del paso 2 (antes, `verify-backup.sh --restore-test`). Después marca la migración como revertida para que Prisma la reintente: `dc --profile tools run --rm migrate npx prisma migrate resolve --rolled-back 20270701080000_v2_9_features`.
3. Vuelve a `./scripts/update.sh`.

No edites el fichero de la migración en el servidor: una migración aplicada no se cambia (incidente del 02/11/2026).
