# Migración técnica de v2.9 a v2.10

> **Estado: cerrada (v2.10.0, 11/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.9.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** ninguna. La última sigue siendo `20270701080000_v2_9_features`.
**Dependencias nuevas:** ninguna.
**Variables nuevas:** ninguna.

> **Si vienes de v2.8 o anterior:** v2.9 sí trae migración (extensión `pg_trgm`, tablas e índices). Haz antes copia de seguridad y sigue [`migracion-v2-8-a-v2-9.md`](migracion-v2-8-a-v2-9.md); `update.sh` aplica ambas en orden con `prisma migrate deploy`.

## 1. Actualizar

Como en cualquier versión (`manual_docker_debian.md` § 8):

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

## 2. Comprobar

- *Estado del servidor* muestra la versión 2.10.0, `/api/health` responde ok y no hay migraciones pendientes.
- Entreno: en una sesión de fuerza, al añadir un ejercicio salen las series de la última sesión como referencia (no se guardan hasta «Hecha») y «Hecha» arranca el descanso.
- Recuperación / Inicio / Rendimiento: bajo la disposición y el PMC hay una frase de una línea.
- Planificación: en el editor de un día propio, «Aplicar a todas las semanas» enseña una vista previa y no escribe hasta «Aceptar y guardar».
- Nutrición: «+ Alimento» tiene la pestaña «Menús» y «Recientes / Habituales» sobre el buscador.

## 3. Marcha atrás

Sin cambios de esquema: volver a la imagen anterior (`update.sh` con la etiqueta de v2.9.0) no requiere tocar la base de datos.
