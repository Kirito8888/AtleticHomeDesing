# Migración técnica de v3.0 / v3.0.1 a v3.2.0

> **Estado: cerrada (v3.2.0, 25/11/2026).** Sirve desde v2.11.0, v3.0.0-preview o v3.0.1-preview: `update.sh` aplica las migraciones pendientes en orden.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones (aditivas, sin borrados ni cambios de tipo):**
- `20270801080000_v3_1_features` (si vienes de v2.11 o v3.0.0): `PersonalToken`, `ExternalWorkout`, `HealthSyncConflict`, `AppleDelivery`, `TrainingSession.kcal`, `RecoveryMetrics.hrvSdnnMs` y `healthSync`. Ver [`migracion-v3-0-a-v3-0-1.md`](migracion-v3-0-a-v3-0-1.md).
- `20270901080000_v3_2_features`: `OrgEvent`, `OrgEventResponse` (única por evento y miembro), enum `RsvpAnswer`, `OrgFee.eventId` (`SetNull`), y `clientKey` en `Macros` y `HydrationLog` (único por usuaria).

**Dependencias nuevas:** ninguna. **Variables nuevas:** ninguna (sigue siendo crítica `STAFF_2FA_REQUIRED_FROM`; si no la tenías en `.env.production`, ponla **antes** de lanzar el doctor).
**Cola nueva:** `event-reminder` (pg-boss) se crea sola al arrancar; los avisos usan el tick horario existente.
**Probado:** `snapshot.sh --before 20270801080000_v3_1_features 20270901080000_v3_2_features` + `test-migration.sh` (datos sintéticos conservados, esquema idéntico a `schema.prisma`). No probado en el servidor real ni con push en un móvil real.

## 1. Antes de actualizar

Copia de seguridad de la base (`update.sh` ya hace una en `backups-pre-update/`; comprueba que hay hueco en disco).

## 2. Actualizar

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
bash scripts/ops/doctor.sh --all
```

## 3. Comprobar

- *Estado del servidor* muestra 3.2.0, `/api/health` ok y la migración `20270901080000_v3_2_features` aplicada.
- `doctor.sh` sin ERROR. Esperado: `/api/clubs/0/events` y `/api/clubs/0/events/0/ics` en 401 sin sesión; las rutas solo-POST de Apple en 405.
- Un club con un evento futuro: una atleta responde en un toque y el staff ve el resumen; el `.ics` del evento descarga.
- Con la red cortada en el móvil, anotar agua y una serie; al volver la red se envían sin duplicarse.

## 4. Marcha atrás

Las migraciones son aditivas: volver a la imagen anterior con `update.sh` no las deshace; las tablas y columnas nuevas quedan sin uso y la bandeja sin red y los eventos dejan de funcionar. Para devolver la base exacta, restaurar la copia previa.
