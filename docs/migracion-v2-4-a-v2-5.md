# Migración técnica de v2.4 a v2.5

> **Estado: cerrado — v2.5.0 (25/10/2026).** Resultados de la verificación de cierre en § 9.
> Complementa la sección «De v2.4 a v2.5» de [`manual_docker_debian.md`](../manual_docker_debian.md#actualizar-a-una-nueva-versión).
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migración:** `20270501080000_v2_5_features` (única, aditiva). **Variables nuevas:** ninguna obligatoria. **Dependencia de ejecución nueva:** `playwright-core`; la imagen de `web` incluye Chromium (§ 8).

## 1. Novedades técnicas

| Área | Cambio |
|---|---|
| Rutinas | Varios espacios a la vez (`answers` y `request` ya son JSON: sin migración por ello). Prescripción en `src/lib/training/prescription.ts` (series, reps, RIR y descanso por objetivo y nivel, con citas y DOI). |
| Planificación | «¿Cómo fue la semana?» solo guarda `PlanFeedback` y propone; `applyWeekFeedback` aplica en una transacción y responde 409 si el plan cambió. |
| Privacidad | El ADMIN global ya no se salta vínculo, ámbito ni art. 18; el informe semanal omite `recovery` sin permiso; Strava fuera de avisos del club, `.ics` y marcas que van a la IA. |
| Seguridad | `lib/auth/login-guard.ts` (fallos por correo+IP y por correo, dispositivos reconocidos con cookie firmada); 2FA con límite de intentos; comprobación de origen en peticiones que modifican datos; **validación de entorno en producción** (§ 3). |
| Experiencia | Esqueletos de carga en páginas índice, diálogo de confirmación propio, bienvenida con Entreno y Recuperación por defecto, formatos de fecha y cifra. |
| Rendimiento | Sesión memoizada por petición (`lib/auth/current.ts`) y panel del club en lote. |
| Finanzas | `/finance` reducido; `/finance/history` (`updateTransaction`, solo gasto/ingreso simples; reescribe las líneas en una transacción), `/finance/budgets` (`budgets-service.ts` versiona con `endDate`: no reescribe meses pasados), `AccountPicker` en el registro rápido. Sin migración propia (usa `Budget`, `FinancialAccount`). |
| Estudio | Pestañas Resumir, Pasos, Asignaturas y Manual PDF. Rutas de IA en `/api/ai/study/…` (adapt, chunk, self-test) que no escriben nada; `POST /api/study/manual` devuelve el PDF sin guardarlo. Cuota de 5 GB (`lib/study/quota.ts`, suma en SQL con bigint). Tablas nuevas `StudyModule`, `StudyTopic`. |
| Operación | Logger JSON con lista blanca de campos (`lib/log.ts`), aviso de copias antiguas (> 36 h) en «Estado», `/api/health` con la cola de trabajos. |
| CI | 43 suites E2E (10 base y 33 en el job `e2e-extra`). |

Detalle completo: [`CHANGELOG.md`](../CHANGELOG.md) § «v2.5».

## 2. Base de datos

`20270501080000_v2_5_features` **solo añade**; no modifica ni borra filas:

- **Siete índices** `CREATE INDEX` por `userId`: `PlanFeedback`, `CalendarFeed`, `SharedReport`, `ReturnProtocol`, `HabitLog`, `PrehabLog`, `RoutineTest` → `<Tabla>_userId_idx`.
- **Dos tablas nuevas:** `StudyModule` (asignatura: nombre, `examDate`, `prepMode`) y `StudyTopic` (tema: etiqueta, minutos, hecho).
- **Una columna nueva:** `StudyDocument.moduleId` (nullable, `ON DELETE SET NULL`).
- Sin relleno de datos. `CREATE INDEX` (sin `CONCURRENTLY`) bloquea las **escrituras** de cada tabla mientras se construye; son tablas pequeñas (segundos), pero conviene no actualizar en pleno uso.
- Como solo añade, la imagen de v2.4 funciona con la BD ya migrada: la vuelta atrás no exige deshacer nada.

## 3. Paso previo obligatorio: revisar `.env.production`

Esta versión **no arranca** en producción (y `web` quedará sin *healthy*) si ocurre alguno de estos casos (`src/lib/env.ts`):

- `AUTH_URL` ausente o sin `https://` (se admite `localhost`).
- `AUTH_SECRET` de menos de 32 caracteres o de ejemplo (`openssl rand -base64 32`).
- Contraseña de la BD en `DATABASE_URL` igual a la de ejemplo (cambiar `POSTGRES_PASSWORD`).

```bash
cd <RUTA_DE_LA_APP>
grep -E '^(AUTH_URL)=' .env.production            # debe empezar por https://
awk -F= '/^AUTH_SECRET=/{print length($2)}' .env.production   # debe ser >= 32
```

No pegues los valores en tickets ni en chats. Cambiar `AUTH_SECRET` cierra las sesiones abiertas.

## 4. Ensayo previo (entorno de desarrollo, no en producción)

```bash
set -a; . ./.env.local; set +a
sh scripts/dev/snapshot.sh --before 20270501080000_v2_5_features   # foto como estaba antes de esta migración
sh scripts/dev/test-migration.sh
```

Criterio: `OK migración`, `antes:` = `después:` y diff de esquema vacío. Último resultado registrado (B11, 20/10/2026): OK. **Repetir al cerrar la versión**, porque la migración se regenera si cambia el esquema (`sh scripts/dev/regen-mig.sh <AAAAMMDDhhmmss_v2_5_features>`).

## 5. Actualización en producción

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

Copia de la BD → `lifeos-web:previous` → `git pull` → build → migración → arranque → healthcheck, con vuelta atrás automática si falla. Equivalente manual:

```bash
mkdir -p backups-pre-update
dc exec -T db pg_dump -U lifeos -d lifeos -Fc > backups-pre-update/pre-v2-5.dump
git pull
dc --profile tools run --rm --build migrate
dc up -d --build web
docker image prune -f
```

## 6. Verificación posterior

1. `dc --profile tools run --rm migrate npx prisma migrate status` → «Database schema is up to date», con `20270501080000_v2_5_features` aplicada.
2. Índices creados:
   ```bash
   dc exec db psql -U lifeos -d lifeos -c "select indexname from pg_indexes where indexname like '%_userId_idx' order by 1"
   ```
   Deben aparecer los siete de § 2.
   ```bash
   dc exec db psql -U lifeos -d lifeos -c "select to_regclass('\"StudyModule\"'), to_regclass('\"StudyTopic\"')"
   ```
   Ambas deben devolver el nombre de la tabla (no vacío).
3. `dc ps` y `dc logs --tail=100 web`: *healthy* y sin «Configuración insegura para producción».
4. En la app: *Estado del servidor* con la versión publicada y sin migraciones pendientes; los registros de `web` salen en JSON; la bienvenida de una cuenta nueva marca solo Entreno y Recuperación; las cuentas existentes conservan su menú.
5. Estudio → «Manual PDF»: genera y descarga un PDF. Un 503 significa que falta Chromium en la imagen (revisar `CHROMIUM_PATH` y que se reconstruyó con `--build`).
6. Ctrl+F5 si una pantalla pide recargar.

## 7. Vuelta atrás

- **Aplicación:** `docker image tag lifeos-web:previous lifeos-web:latest && dc up -d web` (lo hace `update.sh` si falla). Los índices sobrantes son inocuos.
- **Base de datos (solo ante corrupción):** restaurar la copia de `backups-pre-update/` con `pg_restore` sobre una BD vacía, descifrando antes si procede. Ver [`servidor-backups.md`](servidor-backups.md).

## 8. Variables de entorno y dependencias

- **Variables:** ninguna obligatoria nueva; revisa § 3. **`UPLOAD_QUOTA_MB`:** el valor por defecto pasa de 200 a 5120 (5 GB, máximo posible). Si tu `.env.production` copió `UPLOAD_QUOTA_MB=200` de `.env.example`, el límite real seguirá en 200 MB: ponlo a `5120` o bórralo.
- **`CHROMIUM_PATH`:** opcional; la imagen ya la fija a `/usr/bin/chromium`. Solo hace falta definirla fuera de Docker.
- **Dependencias de ejecución:** `playwright-core` (ahora en `dependencies`; maqueta el PDF del estudio, listado en `serverExternalPackages`) y el paquete `chromium` del sistema en la imagen. **La imagen es más grande y el *build* más lento.** Las de desarrollo (`@testing-library/dom`, `@testing-library/react`, `jsdom`) no afectan a producción.
- **Licencias:** `node scripts/third-party-notices.mjs --check` al cerrar.

## 9. Cierre de v2.5.0 (25/10/2026)

Verificación hecha antes de abrir el PR:

- `typecheck` y `lint` sin errores · 197 ficheros y 1196 tests (con BD) en verde.
- 43 suites E2E en verde (incluidas `v25l` y `v25o`, que `scripts/dev/e2e.sh all` no lanza: se ejecutaron por nombre). Semgrep: 0 hallazgos. Licencias: 348 dependencias de producción admitidas. `npm audit --omit=dev`: 0 vulnerabilidades.
- `test-migration.sh`: OK (`v2_5_features`, recuentos y huella de series idénticos, diff de esquema vacío). Sigue habiendo **una sola** migración de v2.5.
- `package.json` y `package-lock.json` en 2.5.0; CHANGELOG, guía, README y este manual sin marca de borrador.

**Sin probar** (no reproducible en el entorno de desarrollo): la imagen Docker real con Chromium, el «Manual PDF» y los resúmenes/tests de estudio con un modelo de IA real, y el aviso «Nueva versión, recargar».

**Nota para quien repita la verificación:** `snapshot.sh --before` ahora también borra los índices que la migración crea sobre tablas ya existentes; sin eso, `test-migration.sh` fallaba con «relation … already exists». En un entorno sin Chromium completo, la suite base `e2e` necesita `CHROMIUM_PATH=/opt/pw-browsers/chromium` (el *headless shell* bloquea las notificaciones).
