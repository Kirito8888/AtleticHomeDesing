# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión:** **v2.3.0 lista para producción**, fusionada en `main` (16/10/2026). v2.0, v2.1 y v2.2 fusionadas. Estabilidad: ver «Cierre v2.3».
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final. La usuaria fusiona; Claude nunca.
- **Bloque en curso:** v2.4 B2 (P3-1…P3-3) **hecho, en PR**. B1 (TTFB) fusionado. Siguiente: punto 3 de «Pendiente» solo si la usuaria lo pide. Auditoría UI: `docs/auditoria-ui.md`.
- **Medidor de salto con HEVC/.mov (P3-4):** la usuaria lo probó en iPhone (16/10/2026) y no le dio problemas. Es su comprobación a mano, sin cifras guardadas: si aparece un fallo con otro vídeo, reabrir.


## Cierre v2.3 (16/10/2026) — todo en verde
- `typecheck` y `lint` OK · `npm run test`: **155 ficheros, 898 tests** · **25 suites E2E** por nombre (incluye v23a–v23d y security) · Semgrep 0 hallazgos (883 ficheros) · licencias: 347 dependencias OK · `npm audit --omit=dev`: 0.
- **Sin migración**: `prisma/` no cambia desde v2.2; `migrate diff` contra la BD de dev vacío. `test-migration.sh` no aplica. Solo versión 2.3.0, CHANGELOG, guía, manual «De v2.2 a v2.3», README y este fichero.
- **Trampa:** `e2e.sh all` reconstruye (`build`) y deja el servidor viejo → todas fallan en el login. Hacer `npm run build`, `serve.sh true` y lanzar la lista de suites por nombre. Las E2E necesitan VAPID en `.env.local`.

## Qué contiene v2.3 (detalle en CHANGELOG y código)
- **B1 navegación:** `layout/nav-items.ts` (`NAV_GROUPS`, `buildNav`, `activeHref`); barra inferior de 5 huecos + «Más»; sidebar por grupos. E2E v23a.
- **B2 Entrenamiento/Tests/Métricas:** `training/hub-links.ts`; accesos plegables, pestañas de Tests, índice en Rendimiento. E2E v23b.
- **B3 Clubes/coach/fisio:** `clubs/club-layout.ts`; `strava/privacy.int.test.ts` cubre `loadClubPanel` y `previewAssignment`. E2E v23c.
- **B4 Ajustes + táctil:** `settings/sections.ts` (7 grupos, índice, anclas viejas intactas), `components/route-error.tsx` + `(app)/error.tsx`, 44 px en 55 rutas. E2E v23d (falla con control < 44 px o scroll horizontal; exime enlaces dentro de un texto).

## Pendiente para v2.4 (decidido el 16/10/2026; orden de trabajo)
1. ~~**Medir TTFB a 390 px**~~ **Hecho** (`e2e/v24a.mts`, `npm run e2e:v24a`; tabla y recomendación en `docs/ttfb-v2-4.md`). Ninguna ruta pasa de ~95 ms de mediana en el contenedor (mediana global 20 ms; ruido ±15 ms; claro/oscuro = réplica, el tema es de cliente).
   **Único hallazgo:** cada render hace 20–50 `findUnique` de `User` idénticos (`src/auth.ts:188`, `auth()` sin memoizar por petición; `/` 40, `/planning` 47). Propuesta: `React.cache` sobre la sesión. **No implementado** y solo urgente si el servidor real da > ~300 ms en `/` o `/planning` (allí la BD tiene latencia de red; aquí no).
2. ~~**P3-1…P3-3 de la auditoría**~~ **Hecho, sin cambios de producto** (`e2e/v24b.mts`, `npm run e2e:v24b`): con sesión sintética completa y datos largos a 390 px, claro y oscuro, no hay recorte ni scroll horizontal en las tablas ni rejillas citadas; la E2E las vigila. Detalle en `docs/auditoria-ui.md`.
3. **Más reglas por familia** (anotado, sin fecha): combinadas y vídeo de saltos. Solo si la usuaria las pide; umbrales en prefs y sin Strava.
4. **Perfil F-V (Samozino) y detección automática de despegue en el salto** (anotado, sin fecha): depende de que el medidor actual aguante más vídeos reales.
5. **Auditar cambios de rol del staff del club** (anotado, sin fecha): hoy se auditan aceptar, salir, rechazar y ámbitos, no el cambio de rol.

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
