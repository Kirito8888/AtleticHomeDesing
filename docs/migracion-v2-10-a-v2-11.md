# Migración técnica de v2.10 a v2.11

> **Estado: cerrada (v2.11.0, 12/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.10.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** ninguna. La última sigue siendo `20270701080000_v2_9_features`.
**Dependencias nuevas:** ninguna (`fast-xml-parser` sube a 5.12.0).
**Variables nuevas:** ninguna.

> **Si vienes de v2.8 o anterior:** v2.9 sí trae migración (extensión `pg_trgm`, tablas e índices). Haz antes copia de seguridad y sigue [`migracion-v2-8-a-v2-9.md`](migracion-v2-8-a-v2-9.md); `update.sh` aplica todas en orden con `prisma migrate deploy`.

## 1. Actualizar

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

`update.sh` ahora limpia tras un healthcheck correcto las etiquetas `sha-` antiguas de la imagen y las copias `pre-update-*` sobrantes (`UPDATE_KEEP_BACKUPS`, 2); usa `scripts/ops/prune-after-update.sh --dry-run` para ver qué haría. Sin probar en el servidor real.

## 2. Comprobar

- *Estado del servidor* muestra la versión 2.11.0, `/api/health` responde ok y no hay migraciones pendientes.
- Las aplicaciones instaladas renuevan su caché sin hacer nada: el service worker pasa a `lifeos-v4` y borra las copias antiguas. Si algo se ve viejo, recargar una vez.
- Finanzas: editar una transferencia o un asiento partido (debe cuadrar); archivar una cuenta y comprobar que apuntar en ella da error; chips de categorías frecuentes en «Apuntar».
- Estudio: la ficha de una asignatura sin fecha de examen propone una (si el horario la tiene); `/study/modules/<id>/practice` genera ejercicios **con la IA real** (calidad de la corrección sin probar fuera de la IA simulada).
- Con dos manuales en PDF a la vez, el tercero en cola espera y el que sobra recibe «generador ocupado» (503).

## 3. Marcha atrás

Sin cambios de esquema: volver a la imagen anterior (`update.sh` con la etiqueta de v2.10.0) no requiere tocar la base de datos. Las cuentas archivadas siguen siendo `isArchived` en la BD y las versiones anteriores las muestran como cuentas normales.
