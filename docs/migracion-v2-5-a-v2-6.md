# Migración técnica de v2.5 a v2.6

> **Estado: cerrada (v2.6.0, 03/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.5.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`; `USUARIO_BD` y `NOMBRE_BD` son el usuario y la base de datos de `.env.production` (`POSTGRES_USER`, `POSTGRES_DB`).

**Migraciones (ambas aditivas):**

| Migración | Qué añade |
|---|---|
| `20270601080000_v2_6_features` | Índice GIN `to_tsvector('spanish', content)` en `DocumentChunk`. |
| `20270602080000_v2_6_study_pack` | Columna `StudyModule.examFormat`, tablas `StudyTopicPack` y `QuestProgress`. Con `IF NOT EXISTS`: se puede aplicar dos veces. |

**Variables nuevas:** ninguna obligatoria. Opcional `STUDY_PACK_MIN_INTERVAL_MS` (pausa entre llamadas a la IA al generar un paquete; con el nivel gratuito de Gemini, 4000–6000).
**Dependencias nuevas:** ninguna (el PPTX se lee con `fflate`, que ya estaba).

## 1. Actualizar

Como en cualquier versión (`manual_docker_debian.md` § 8): copia de la base de datos, `git pull`, reconstruir y aplicar migraciones.

```bash
cd <RUTA_DE_LA_APP>
dc --profile tools run --rm migrate
```

Las dos migraciones se aplican en orden; la segunda no falla aunque la primera ya estuviera aplicada ni aunque alguien haya creado las tablas a mano.

## 2. Si desplegaste `main` mientras la PR #110 tenía las tablas en `v2_6_features`

Ese nombre ya estaba aplicado y Prisma no lo reaplica, así que las tablas no se crearon y las páginas de asignaturas dan «Esta página no se ha podido mostrar». Basta con actualizar al código nuevo y ejecutar el paso anterior: la migración nueva crea lo que falta. Para comprobarlo:

```bash
dc exec db psql -U USUARIO_BD -d NOMBRE_BD -c '\d "StudyTopicPack"' -c '\d "QuestProgress"'
dc exec db psql -U USUARIO_BD -d NOMBRE_BD -c "select migration_name, finished_at from _prisma_migrations order by started_at desc limit 3"
```

Si ya aplicaste a mano el SQL de reparación, no hace falta deshacerlo.

## 3. Comprobar

1. `/study/modules/<asignatura>` carga y muestra «Paquete de estudio (IA)».
2. «Generar paquete» en un tema con apuntes pasa a «Generando…» y termina en «Listo» (necesita IA configurada y consentimiento).
3. En el Modo Juego, el progreso se recupera tras borrar los datos del navegador.

## 4. Reglas que salen de este incidente

- Una migración **ya desplegada** no se edita ni se regenera, aunque sea de la misma versión.
- Si `main` puede desplegarse a mitad de versión, cada cambio de esquema nuevo va en su propia migración, con `IF NOT EXISTS` si es posible.
