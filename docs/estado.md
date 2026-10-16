# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión:** **v2.2.0 lista para producción**, pendiente de fusionar el PR de release (16/10/2026). v2.0 y v2.1 fusionadas. Estabilidad: ver «Cierre v2.2».
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final. La usuaria fusiona; Claude nunca.
- **Bloque en curso:** ninguno. Hecho: auditoría UI a 390 px (`docs/auditoria-ui.md`, solo informe, **sin cambios de código**; pendiente que la usuaria apruebe v2.3-A o pida medir con datos). Siguiente: elegir alcance de v2.3.
- **Pendiente manual (no es código):** probar el medidor de salto con HEVC/.mov real en un iPhone (P3-4): grabar en cámara lenta y en normal,
  subirlo en `/training/tests/salto`, comprobar fps detectados y altura creíble (~30–60 cm en un CMJ). **No está probado.**

## Cierre v2.2 (16/10/2026) — todo en verde
- `typecheck` y `lint` OK · `npm run test`: **151 ficheros, 877 tests** OK · `e2e.sh all`: **21 suites** OK (incluye v22a, v22b y security).
- `test-migration.sh` OK: `v2_2_features` aplica sobre la foto previa + 120 sesiones sintéticas; recuentos y huellas idénticos; `migrate diff` vacío.
- Semgrep: 6 reglas, 872 ficheros, **0 hallazgos** · licencias: 347 dependencias de producción admitidas · `npm audit --omit=dev`: **0 vulnerabilidades**.
- Sin cambios de código en el cierre: solo versión 2.2.0, CHANGELOG, guía, manual «De v2.1 a v2.2», README y este fichero. `docs/propuesta-v2-2.md`: P1, P2 y P3 resueltos (P3-4 a mano).
- **Trampas de entorno al cerrar:** (1) un comando que contenga el texto `next-server` (p. ej. `pgrep -f next-server` lanzado por Claude) hace que `e2e.sh` crea que
  hay servidor y no lo arranque → todas fallan con `ERR_CONNECTION_REFUSED`; (2) `e2e` y `e2e:security` necesitan VAPID en `.env.local` (no versionado; `session-start.sh` no las genera:
  `npx web-push generate-vapid-keys`); (3) `snapshot.sh --before 20270301080000_v2_2_features` antes de `test-migration.sh` en un contenedor nuevo (falta `/tmp/atlenza-before.dump`).

## Qué contiene v2.2 (detalle en CHANGELOG y código)
- **P1 · privacidad e integridad.** Migración `20270301080000_v2_2_features` (`WatchAlert`, `ApiMetricMinute`; solo tablas). Strava filtrado en toda vista de la entrenadora
  (helpers en `strava/policy.ts`; `coach/overview.ts`, hilo, `records`, informe compartido, `multi-plan`; `pmc` devuelve `loadHidden`). Test transversal `strava/privacy.int.test.ts`:
  **toda ruta nueva que lea sesiones de otra persona debe entrar ahí**. Métricas por réplica con `flushMetrics`; `metricsSummary` es async. Restaurar recupera `AthleteProfile`.
  `test-migration.sh` carga `scripts/dev/synthetic-data.sql` (ajustarlo si cambian columnas obligatorias). `/admin` exige 2FA: el E2E mira las métricas en BD.
- **P2 · pista, reglas, móvil.** Sin migración. PR `TRACK_TIME` (`disciplines.ts#bestTimesByDistance`, solo series manuales), temporadas con tiempos, reglas `fast-cap`/`km-ramp`/`jump-cap`
  (umbrales en prefs, **siempre sin Strava**), plan IA con la prueba, bienvenida con «Mi prueba». Móvil: `overflow-x-auto`, rejillas 2→4, 44 px bajo `md`. `weather.ts` sigue en memoria (aceptado).
  `/coach/multi` lanza error de servidor a una atleta (solo entrenadoras): fuera del barrido E2E.
- **P3.** Medido el JS de cliente (nada alarmante; sin TTFB). Borrar ejercicios propios (409 con series). Aviso al compartir protocolo de fisio (`notifyOnce`, texto genérico).
  Auditoría de club con `COACH_SCOPES_CHANGED` (sin enum nuevo). Tira semanal táctil.

## Objetivos tentativos v2.3 (nada comprometido; elegir con la usuaria)
1. Meter `loadClubPanel` y `previewAssignment` en `strava/privacy.int.test.ts` (únicas lecturas ajenas sin caso).
2. Más reglas por familia (P2-4 quedó en 3): combinadas, vídeo de saltos.
3. Medir TTFB a 390 px antes de optimizar consultas (P2-7/P3-1 sin cifra).
4. Los 3 controles < 44 px de `/settings` (son los `<input>` de «Mi pista» en `carbs-form.tsx:124-131`, ver auditoría P2-1) y auditar cambios de rol del staff del club.
   Auditoría UI: ~13 controles táctiles < 44 px **por análisis estático** (loggers) y falta `error.tsx` fuera de Ajustes (P1-1); medir con sesión rellena antes de arreglar.
5. Resultado del P3-4 en iPhone; si el HEVC no carga, decidir entre guía o conversión local.
6. Perfil F-V (Samozino) y detección automática de despegue en el salto (fuera desde el bloque Salto).

## Histórico resumido (v2.0 y v2.1)
- **/settings «This page couldn't load»:** causa NO reproducida; endurecido con `settings/error.tsx` (recarga si es `ChunkLoadError`; en producción probar Ctrl+F5), `lib/settings/optional.ts` y `shortWhen`.
- **Salto:** `training/jump.ts` (fórmulas puras), API `api/training/tests/jump` (recalcula en servidor), UI `jump-meter.tsx`, guía `jump-guide.tsx`, E2E `e2e:salto`. El vídeo nunca sale del navegador.
  `effectiveFps` usa los fps **del fichero** salvo tramo de cámara lenta; `videoWarnings` avisa de conversiones de iOS.
- **v2.0:** A clubes y cuotas (`src/lib/clubs/`; pertenecer no da acceso, la atleta elige `scopes`/`canPlan`; `processingRestrictedAt` bloquea siempre) · B varias atletas y «qué pasa si»
  (sin escrituras; un borrador por atleta) · C flashcards compartidas (`FlashcardReview`; SQL de datos en `prisma/data-migrations/<migración>.sql`, que `regen-mig.sh` añade al final) ·
  D VFC del PDF y tendencias (umbrales en prefs, nada a la IA) · E varias réplicas (`withJobLock`, límite de peticiones en Postgres con HMAC).
- **v2.1:** 1 disciplinas (`primaryEvent`, `training/disciplines.ts`, E2E v21a) · 2 ejercicios con vídeo propio (`files/sealed-files.ts`, solo MP4/WebM por firma, AES-GCM de fichero entero,
  catálogo global sin vídeo, entrenadora solo consulta; E2E v21b) · 3 curvas de referencia citadas (catálogo **vacío** a propósito, sin extrapolar, nada a la IA) y protocolos de fisio compartidos
  (solo cuenta COACH, vínculo + ámbito RECOVERY, quitar acceso borra el seguimiento; E2E v21c). `snapshot.sh --before` borra tablas, tipos y columnas de la migración para regenerarla entera.
  Restaurar conserva `discipline` de las sesiones; vídeos y lo compartido no se restauran.

## Decisiones tomadas
- LEAF-Q: cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava y la salud cifrada fuera de la IA, de la entrenadora y del `.ics`.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
- Probar HEVC/.mov en su iPhone (P3-4).
