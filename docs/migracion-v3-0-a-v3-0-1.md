# Migración técnica de v3.0.0-preview a v3.0.1-preview

> **Estado: cerrada (v3.0.1-preview, 22/11/2026).** Recoge lo necesario para actualizar el servidor desde v3.0.0-preview (o desde v2.11).
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** una, **aditiva**: `20270801080000_v3_1_features` (tablas `PersonalToken`, `ExternalWorkout`, `HealthSyncConflict`, `AppleDelivery` y sus enums; columnas `TrainingSession.kcal`, `RecoveryMetrics.hrvSdnnMs` y `healthSync`). Sin borrados ni cambios de tipo. Aunque la versión sea de parche, **el despliegue debe pasar por `update.sh`**.
**Dependencias nuevas:** ninguna; `effect` se fija en 3.22.5 con `overrides`.
**Variables nuevas:** ninguna.
**Probado:** `snapshot.sh --before 20270701080000_v2_9_features 20270801080000_v3_1_features` + `test-migration.sh` (datos sintéticos conservados, esquema idéntico a `schema.prisma`). No probado en el servidor real.

## 1. Antes de actualizar

Copia de seguridad de la base (el `update.sh` ya hace una en `backups-pre-update/`; comprueba que hay hueco en disco).

## 2. Actualizar

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
bash scripts/ops/doctor.sh --all
```

## 3. Comprobar

- *Estado del servidor* muestra 3.0.1-preview, `/api/health` ok y la migración `20270801080000_v3_1_features` aplicada.
- `doctor.sh` sin ERROR. Esperado: `/api/training/apple-fitness/pending` y `/api/settings/apple-fitness/token` en 401 sin sesión; `/api/training/apple-fitness`, `/api/recovery/apple-health` y `/api/settings/apple-fitness/test` en 405 con GET (solo aceptan POST).
- Ajustes → Apple Fitness: genera el token, configura el Atajo con la URL pública de tu servidor y pulsa «Probar envío». «Diagnóstico de conexión» muestra la prueba. Si usas proxy, la cabecera `Authorization: Bearer` debe llegar intacta.
- Un entreno enviado aparece en la bandeja de Entreno; una métrica distinta de la anotada abre un aviso en Recuperación.

## 4. Marcha atrás

La migración es aditiva: volver a la imagen de v3.0.0-preview con `update.sh` no la deshace y las tablas nuevas quedan sin uso. Los tokens y envíos de Apple dejan de funcionar con la imagen antigua. Para devolver la base exacta, restaurar la copia previa.
