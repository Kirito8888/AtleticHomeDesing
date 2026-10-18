# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión:** **v2.4.0 en PR de release** (17/10/2026), pendiente de que la usuaria la fusione. v2.0–v2.3 fusionadas. Estabilidad: ver «Cierre v2.4».
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final. La usuaria fusiona; Claude nunca.
- **Ops (18/10/2026):** `scripts/ops/audit-server.sh` + `docs/servidor-auditoria.md`: auditoría de servidor de solo lectura y anonimizada, sin tocar la app. Probado en contenedor (sin escrituras, sin secretos); **no probado en un servidor real con SSH/ufw/PM2/systemd** (el contenedor no los tiene): la usuaria debe revisar el primer informe. En PR.
- **Bloque en curso:** ninguno. v2.4 B1–B6 fusionados. Siguiente versión: sin decidir. Auditoría UI: `docs/auditoria-ui.md`.
- **Medidor de salto con HEVC/.mov (P3-4):** la usuaria lo probó en iPhone (16/10/2026) y no le dio problemas. Es su comprobación a mano, sin cifras guardadas: si aparece un fallo con otro vídeo, reabrir.


## Cierre v2.4 (17/10/2026)
- `typecheck` y `lint` OK · `npm run test` (con BD): **158 ficheros, 931 tests** · **28 suites E2E** por nombre (v17 y v20b tras repetir; ver abajo) · Semgrep 0 hallazgos (892 ficheros) · licencias: 347 dependencias OK · `npm audit --omit=dev`: 0.
- `test-migration.sh` OK: `v2_4_features` aplica sobre la foto previa + 120 sesiones sintéticas; recuentos y huellas idénticos. Solo añade `FvSeries`.
- **E2E dependientes del día:** `v20b` fallaba en fin de semana (el plan y la semana tipo descartan los días anteriores a «inicio»; un sábado salen vacíos). Arreglado en el test (parte del lunes / próximo lunes). **Rareza de producto sin tocar:** `/coach/multi` propone «hoy» como inicio, y en sábado/domingo una semana tipo de lun–vie sale vacía. `v17` no limpia las cuentas demo: si se repite una tanda, borrar `demo-thrower-%` de `User` antes.
- **Trampas:** `npm run test` sin `. ./.env.local` omite 48 ficheros de integración y da «verde» falso. Las E2E necesitan VAPID en `.env.local` (no versionado): `session-start.sh` no lo genera. No usar `e2e.sh all`; lanzar las suites por nombre en segundo plano con límite largo y sin `| tail` (se pierde la salida). Un comando de Claude que contenga el texto `next-server` (p. ej. `pgrep -f`) hace que `e2e.sh` crea que hay servidor y no lo arranque. En contenedor nuevo, `snapshot.sh --before 20270401080000_v2_4_features` antes de `test-migration.sh`.

## Histórico de cierres
- **v2.3 (16/10/2026):** sin migración; 898 tests, 25 suites E2E. Navegación agrupada (`layout/nav-items.ts`), Ajustes por grupos (`settings/sections.ts`), 44 px táctiles, `route-error.tsx`.
- **v2.2 (16/10/2026):** migración `v2_2_features` (`WatchAlert`, `ApiMetricMinute`); Strava filtrado en toda vista de la entrenadora (`strava/policy.ts`; **toda ruta nueva que lea sesiones de otra persona debe entrar en `strava/privacy.int.test.ts`**); PR de pista y reglas `fast-cap`/`km-ramp`/`jump-cap`.

## Qué contiene v2.4 (detalle en CHANGELOG y código; punto 4 = única migración, punto 6 = sin validar)
1. ~~**Medir TTFB a 390 px**~~ **Hecho** (`e2e/v24a.mts`, `npm run e2e:v24a`; tabla y recomendación en `docs/ttfb-v2-4.md`). Ninguna ruta pasa de ~95 ms de mediana en el contenedor (mediana global 20 ms; ruido ±15 ms; claro/oscuro = réplica, el tema es de cliente).
   **Único hallazgo:** cada render hace 20–50 `findUnique` de `User` idénticos (`src/auth.ts:188`, `auth()` sin memoizar por petición; `/` 40, `/planning` 47). Propuesta: `React.cache` sobre la sesión. **No implementado** y solo urgente si el servidor real da > ~300 ms en `/` o `/planning` (allí la BD tiene latencia de red; aquí no).
2. ~~**P3-1…P3-3 de la auditoría**~~ **Hecho, sin cambios de producto** (`e2e/v24b.mts`, `npm run e2e:v24b`): con sesión sintética completa y datos largos a 390 px, claro y oscuro, no hay recorte ni scroll horizontal en las tablas ni rejillas citadas; la E2E las vigila. Detalle en `docs/auditoria-ui.md`.
3. **Más reglas por familia**: ~~combinadas~~ **Hecho (B4)**: `engine.ts` da `fast-cap` y `jump-cap` a la familia `combined` con los umbrales de prefs existentes (sin rampa de km, sin Strava; etiquetas de `rules-form.tsx` actualizadas; tests en `engine.test.ts` y `rules.int.test.ts` con `decatlon`). Pendiente: vídeo de saltos, solo si la usuaria lo pide.
4. ~~**Perfil F-V (Samozino)**~~ **Hecho (B5)**.
   - `training/fv-profile.ts` (puro; reutiliza `G`, `jumpHeight`, `takeoffVelocity`): regresión F-v de SJ con 2–4 cargas → F0, V0, Pmax, pendiente, óptima y desequilibrio (FVimb). Bandas (10/40 %) y r² mínimo 0,95 son **constantes citadas** (Jiménez-Reyes 2017; Samozino 2014), no prefs.
   - **Única migración de v2.4:** `20270401080000_v2_4_features` (tabla `FvSeries`, solo entradas; el perfil se recalcula al leer). `test-migration.sh` OK. Exportar/restaurar incluye `fvSeries`.
   - UI: pestaña «Perfil F-V» (`/training/tests/perfil-fv`); el `JumpMeter` admite `onUseHeight` (SJ fijo, sin guardar en `TestResult`: así no va a la IA ni ensucia las marcas de SJ). API `api/training/tests/fv`.
   - **Privacidad:** no va a la IA (`data-ai.ts` no lo lee; test de integración). **La entrenadora no lo ve, a propósito:** ninguna vista suya lee tests hoy y darle esta pantalla exige elegir ámbito (`LOAD` encajaría); no viene de Strava (entrada manual). Si se abre, hacerlo con ámbito y añadirlo a `strava/privacy.int.test.ts`.
   - E2E **`e2e:v24c`** (v24a y v24b ya eran TTFB y P3). Óptimo calculado por búsqueda numérica del modelo de Samozino 2012; **no contrastado con la tabla del artículo** (sin acceso al texto): lo verifican los tests por propiedades (el óptimo es máximo, perfil óptimo → FVimb ≈ 0).
5. ~~**Auditar cambios de rol del staff del club**~~ **Hecho, sin enum ni migración**: `updateMember` registra `COACH_SCOPES_CHANGED` en la Actividad de la persona afectada (`rol: X → Y · cambiado por …`; IP solo si es ella). Además cierra un hueco: una cuenta ATHLETE ya no se promueve a staff por PATCH (como al invitar). Test en `clubs.int.test.ts`, paso en `e2e/v23c.mts`.

6. **Sugerir fotogramas (B6)**: `training/jump-detect.ts` (puro: `motionFromFrames`, `detectJumps` → pares despegue/aterrizaje con confianza; tests con señales sintéticas) y `components/training/jump-scan.ts` (lee el vídeo en el navegador: vídeo oculto, seek por fotograma, tercio inferior a 96 px; tope 2400 fotogramas). Interruptor **apagado por defecto** en `jump-meter.tsx`; «Aceptar» solo rellena las marcas, nada se guarda sin «Añadir intento»/«Guardar». Sin DJ (tres picos), sin esquema. E2E: ampliada `e2e:salto` (clip ffmpeg con «pies» que salen de la zona).
   - **Umbrales (`MIN_CONFIDENCE` 0,5, `MIN_PEAK` 1 %, vuelo 0,15–1,0 s) son estimaciones sin calibrar.** Un vídeo sintético prueba el cableado, no la precisión.
   - **Comprobación manual de la usuaria (iPhone) — pendiente:** grabar de lado, con los pies en el tercio inferior, 5 CMJ en cámara lenta (240) y 5 en normal (60). Por intento: marcar a mano, activar «Sugerir fotogramas», anotar propuesta vs. tuya (despegue y aterrizaje, error en fotogramas) y los segundos que tarda el análisis. Criterio orientativo: |error| ≤ 2 fotogramas a 240 / ≤ 1 a 60 en ≥ 8 de 10; si no, reabrir (umbrales, o zona elegible). Si el análisis tarda demasiado en HEVC 240, pasar a `requestVideoFrameCallback`.

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
