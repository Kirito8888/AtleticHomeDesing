# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión fusionada:** v2.0 (14/10/2026); v2.1.0 pendiente de fusionar. CI en verde.
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final.
- **Arreglo /settings («This page couldn't load») — HECHO, causa NO reproducida.** El texto sin *digest* indica excepción **en cliente**. Con usuaria vacía, ADMIN con 2FA y cuentas con Telegram/Strava/IA/passkey/push en BD local (390 px) la página carga sin errores. Endurecido: `settings/error.tsx` (boundary con «Reintentar»; si es `ChunkLoadError` recarga), `lib/settings/optional.ts` (los bloques opcionales fallan a un valor de reserva; no se envuelven `totpStatus` ni `auditIntegrity` para no mentir sobre seguridad) y `shortWhen` en `server-status.tsx` (`Intl.format` lanzaba RangeError con fecha inválida). Si vuelve a fallar en producción: el boundary muestra el código del error; recargar con Ctrl+F5 por si son chunks viejos tras actualizar.
- **Bloque en curso:** ninguno. v2.0 y v2.1 cerradas y fusionadas. **v2.2 bloque 1 (P1) — HECHO**, PR a main pendiente de fusionar. Siguiente: bloque 3 «Pista de verdad» o 4 «Móvil 390 px» de `docs/propuesta-v2-2.md` (P2/P3).

## Bloque Salto (hecho, fuera de la lista A–E)
Medidor de salto por tiempo de vuelo en vídeo (Balsalobre-Fernández 2015): `src/lib/training/jump.ts` (fórmulas puras,
tests), API `api/training/tests/jump` (recalcula en servidor y guarda **mejor** y **media** como dos tests del catálogo:
`cmj`/`sj`/`abalakov`/`djRsi` y `…Mean`), UI `components/training/jump-meter.tsx` en `/training/tests/salto`, E2E `e2e:salto`.
Sin cambios de esquema. El vídeo nunca sale del navegador. Los fps detectados son los **del fichero** (pueden ser 30 si el móvil
reexportó la cámara lenta): la atleta confirma los fps de captura. Fuera: perfil F-V (Samozino) y detección automática.
**Mejora v2.1 (salto):** fps de captura NTSC+PAL (25/30/50/60/100/120/240; el schema los valida con `isCaptureFps`), `accept` con `video/quicktime`
y `webkit-playsinline` para .mov de iPhone, error de `<video>` con mensaje de códec (HEVC en escritorio) en vez de quedarse en «Analizando…», deslizador
de fotograma y seek coalescido (un solo `currentTime` en vuelo; el último objetivo se aplica en `seeked`). **No había extracción a canvas**: la espera
venía de la detección de fps (ahora 10 intervalos, tope 2,5 s, controles activos al terminar) y de seeks encolados. El paso ±1 va por los fps **del
fichero** (no los de captura: un 240 reexportado a 30 repetiría fotogramas); el cálculo, por los de captura. E2E con .mov a 50 fps (VP9 en MP4: el
Chromium de pruebas no decodifica H.264) y .mov ilegible. **Sin probar:** HEVC real en Safari iOS (la usuaria, en su iPhone).
**Corrección (salto, 15/10):** el medidor daba 7,7 cm en un salto de ~55 cm (4K a 100 fps). Causa: mezclaba «fps de captura» con los del fichero. Ahora
`effectiveFps`: velocidad real → fps **del fichero** (medidos; si no se pueden medir, los indica la atleta, ya no hay 30 de reserva); tramo de cámara
lenta (el iPhone solo ralentiza un tramo) → fps de grabación. `videoWarnings` avisa de conversión de iOS (grabó 100, llegó 25), de cámara lenta mal
marcada y de vuelos imposibles. Guía en `jump-guide.tsx` (4 secciones plegables: cámara y ajustes por dispositivo —iPhone, Android, otras—, subir y ajustar, cómo se calcula con evidencia citada, y recomendaciones). Los números de la guía salen de `jump.ts` (`frameErrorCm`, `jumpHeight`). La API sigue recibiendo `fps` efectivos.

## v2.0 · bloques (resumen; detalle en CHANGELOG y código)
- **A · Clubes y cuotas** (`src/lib/clubs/`, `/clubs`): pertenecer no da acceso; la atleta acepta y elige `scopes`/`canPlan`. `resolveAthleteId` une
  vínculo 1:1 y clubes; `processingRestrictedAt` bloquea siempre (el ADMIN global se lo salta aquí por comportamiento previo). Sin eventos de auditoría de club.
- **B · Varias atletas + «qué pasa si»** (`/coach/multi`, `coach/what-if.ts`): un borrador por atleta, la atleta activa; sin escrituras en la simulación; el ADMIN global no se salta nada.
- **C · Flashcards compartidas**: `FlashcardReview` por persona (el SM-2 ya no vive en `Flashcard`, columnas legado). SQL de datos en
  `prisma/data-migrations/<migración>.sql`, que `regen-mig.sh` añade al final; `snapshot.sh --before <migración>` deja la foto previa a esa migración.
- **D · VFC del PDF y tendencias**: `ParsedWeek.hrv`; sin semanas marcadas no hay aviso semanal de VFC. Tendencias en `/recovery/trends`, umbrales en prefs, nada a la IA.
- **E · Varias réplicas**: `withJobLock` (advisory locks) en scheduler y Telegram; límite de peticiones en Postgres con HMAC. `admin/watch.ts` y `admin/metrics.ts` pasaron a Postgres en v2.2; solo `weather.ts` sigue en memoria (aceptado, P2-8).
- **Cierre v2.0 — HECHO.** `test-migration.sh` OK (foto con `snapshot.sh --before`); el SQL de datos de C copia 3 tarjetas → 3 reviews y es
  idempotente. Exportar cuenta ahora incluye `clubs.memberships` (con mis cuotas) y ya traía `study.flashcardReviews`; restaurar no recrea clubes
  ni mazos compartidos (vínculos). Versión 2.0.0, CHANGELOG, guía y manual «De v1.10 a v2.0». Typecheck, lint, 789 tests, Semgrep, licencias y
  las 16 suites E2E en verde. **Trampas de entorno:** (1) `e2e.sh all` con un servidor viejo en marcha deja chunks desfasados: para el servidor
  antes; (2) `pgrep -f next-server` casa con cualquier comando que contenga esa cadena y salta el arranque: usa `serve.sh true` a mano;
  (3) `e2e` y `e2e:security` necesitan claves VAPID en `.env.local` (añadidas en local, no en el repo; `session-start.sh` no las genera).

## v2.1 · bloques
- **1 · Más disciplinas — HECHO.** Migración `20270201080000_v2_1_features` (solo `AthleteProfile.primaryEvent String?`; en los bloques
  siguientes: `snapshot.sh --before 20270201080000_v2_1_features` y regenerar). `Discipline`, `TrackSession` y `TrackInterval` ya cubrían el
  dato: el bloque añade **especialidad** y una capa pura `training/disciplines.ts` (catálogo `EVENTS` 100 m…decatlón, `familyOf`, `defaultsFor`,
  `intervalStats`, `sessionHeadline`, `intervalMetric`). Elegir «Mi prueba» en Ajustes fija la disciplina principal (la prueba manda).
  `/training/new` abre en Pista (velocidad/vallas/fondo/combinadas) o Técnica (saltos); sin perfil o lanzamientos: como siempre (Fuerza).
  Pista guarda `discipline`. Series: m/s en velocidad, ritmo en fondo; resumen con mejor tiempo (centésimas). Lista, diario (ahora también
  sesiones de pista) y calendario usan `sessionHeadline`; la semana muestra «Distancia/Intentos esta semana» salvo en lanzamientos (tope de
  lanzamientos intacto) y el enlace a jabalina solo para esa familia. Lanzamientos/tonelaje/TSS sin tocar (test de regresión).
  Tests: `disciplines.test.ts`, `disciplines.int.test.ts`; E2E `e2e:v21a` (también en `e2e.sh all`).
  Pendiente/fuera: no se crean `PersonalRecord` `TRACK_TIME` al guardar; reglas de `rules/engine.ts` y plan IA siguen centrados en lanzamientos;
  el selector de disciplinas del asistente de bienvenida no pide la prueba.
- **2 · Biblioteca de ejercicios con vídeo propio — HECHO.** Misma migración `20270201080000_v2_1_features` (regenerada con `regen-mig.sh`; añade
  a `Exercise`: `description`, `videoPath`, `videoMime`, `videoBytes`, `updatedAt`, todo nulo). Módulo de ficheros real: `src/lib/files/sealed-files.ts`
  (+ `EXT` mp4/webm); validación pura en `files/video.ts` (`sniffVideo` por firma, `checkVideo`, `VIDEO_MAX_BYTES` 25 MiB). Servicio
  `training/exercise-library.ts`; API `api/training/exercises[/id[/video]]` (GET/PATCH ficha; GET/PUT/DELETE vídeo, límite `videoUpload`);
  UI `/training/exercises` y `/training/exercises/[id]` (`exercise-forms.tsx`, `exercise-video.tsx`); enlace en `/training`.
  **Decisiones:** (1) solo se editan ejercicios propios; el catálogo global es solo lectura y **sin vídeo** (sería de una usuaria visible a todas).
  (2) La entrenadora consulta (vídeo incluido) con `?athlete=` + ámbito SESSIONS vía `resolveAthleteId`; nunca edita. (3) Reproducción: `fetch` al
  pulsar «Ver vídeo» → Blob local → `<video>`; se libera al cerrar; `Cache-Control: no-store`; sin URLs públicas ni Range (AES-GCM de fichero entero).
  (4) Solo MP4 (marcas ISO) y WebM (DocType webm) por firma; **QuickTime/.mov y MKV se rechazan** (el iPhone puede grabar .mov: exportar a MP4).
  (5) Subida solo por `multipart` con fichero: no hay campo de URL ni descarga de terceros. Rotación de clave incluye los vídeos (`rotate.ts`);
  exportar cuenta lleva `description` pero no los vídeos; restaurar ignora `videoPath/Mime/Bytes`.
  Tests: `files/video.test.ts`, `training/exercise-library.int.test.ts`; E2E `e2e:v21b` (también en `e2e.sh all`).
  **Trampa:** `snapshot.sh --before` solo borra tablas/tipos, no columnas añadidas: si el bloque anterior añadió columnas, `regen-mig.sh` las pierde
  (CI: «AthleteProfile.primaryEvent does not exist»). Comprobar que el `migration.sql` conserva las de los bloques previos y probar con una foto sin ellas.
  Pendiente/fuera: la descripción no va a la IA ni al plan; no hay borrado de ejercicios propios (si se añade, borrar también el clip);
  sin recorte ni análisis del vídeo.
- **3 · Curvas de referencia citadas + protocolos de fisio compartidos — HECHO.** Misma migración `20270201080000_v2_1_features` (+ `ReferenceCurve`,
  `PhysioProtocol`, `PhysioProtocolShare`; regenerada con `regen-mig.sh`). `snapshot.sh --before` ahora también borra las **columnas** añadidas
  (arregla la trampa del bloque 2). **Curvas:** el catálogo nace **vacío** (decisión: no se siembran números «de memoria» bajo un DOI real);
  se dan de alta a mano copiando la tabla (`/training/tests/curvas`), con estudio/autores/año/cita obligatorios y DOI/https validados.
  ADMIN → global; COACH → privada; atleta → 403. Puro en `training/reference-curves.ts` (`interpolate` lineal **sin extrapolar**, `ageAt`, `overlay`,
  `summarizeOverlay`; delta con signo según `higherIsBetter`; banda low/high). Servicio `reference-curves-service.ts`; `/training/tests/comparar`
  (`?athlete=` con ámbito LOAD) con gráfica recharts y ficha de cita; todo local, **nada va a la IA**. Sin fecha de nacimiento no se compara.
  **Fisio:** `recovery/physio-protocol.ts` (fases con ejercicios y criterios; editor de texto `# fase | dolor máx N` / `- ejercicio: dosis` / `? criterio`),
  `physio-service.ts`. Solo cuenta COACH crea/comparte (la ADMIN global **no** se salta nada; no hay rol «fisio»); compartir exige vínculo activo
  (1:1 o club) + ámbito RECOVERY y `processingRestrictedAt` bloquea (lectura del seguimiento incluida, que sale «bloqueado» y sin datos).
  La atleta ve el contenido en solo lectura y marca criterios y dolor del día (`/recovery/fisio`); editar → 403, ajena → 404. Quitar el acceso borra
  su seguimiento. Si el vínculo se revoca, la atleta conserva su copia compartida. Exportar cuenta: curvas propias, protocolos propios (sin el
  seguimiento de otras) y lo recibido; restaurar no lo recrea. Límite `physioShare`. Tests: `reference-curves.test.ts`, `physio-protocol.test.ts`,
  `physio.int.test.ts`; E2E `e2e:v21c` (también en `e2e.sh all`). Fuera/pendiente: sin avisos a la atleta al compartir (sin email); sin diagnóstico ni IA.

- **Cierre v2.1 — HECHO.** `snapshot.sh --before 20270201080000_v2_1_features` + `test-migration.sh` OK (**límite:** la BD de dev solo tiene el catálogo,
  32 ejercicios, 0 usuarios/sesiones: prueba el esquema y que no se pierde el catálogo, no la conservación de datos de usuaria). Restaurar: la descripción
  vuelve, el vídeo y lo compartido no; las exportaciones v2.0 restauran (test). **Regresión corregida:** restaurar perdía `discipline` de las sesiones
  (`session-snapshot.ts`; ahora se conserva siempre). `AthleteProfile` (incl. `primaryEvent`) no se restaura, como antes. Versión 2.1.0, CHANGELOG, guía,
  manual «De v2.0 a v2.1». Typecheck, lint, 843 tests, Semgrep, licencias y E2E `all` en verde.

## v2.2 · bloques
- **1 · P1 (privacidad, integridad, vigilancia) — HECHO.** Migración `20270301080000_v2_2_features` (`WatchAlert`, `ApiMetricMinute`; solo tablas).
  **Strava:** helpers en `strava/policy.ts`; `coach/overview.ts` (lista y detalle de la entrenadora), hilo de comentarios (404), `/api/training/records`,
  informe compartido y `multi-plan` filtran; `/api/training/pmc?athleteId` quita tss/ctl/atl/tsb/acwr y devuelve `loadHidden` si hay Strava en la ventana
  (≈ periodo+120 días); `multi-plan` no simula esa atleta. Test transversal `strava/privacy.int.test.ts`: **toda ruta nueva que lea sesiones de otra persona debe entrar ahí**.
  **Métricas/vigilancia:** cada réplica cuenta en memoria y sube sus minutos (`flushMetrics`: al cambiar de minuto y cada 5 min en `safetyTick`, fuera del cerrojo);
  `metricsSummary` es **async** y suma todas las réplicas (si la BD falla, solo la local); `WatchAlert` guarda lo avisado. **Restaurar** recupera `AthleteProfile`.
  **`test-migration.sh`** carga `scripts/dev/synthetic-data.sql` (esquema de la foto previa; ajustarlo si cambian columnas obligatorias) y compara más tablas.
  E2E `e2e:v22a` (también en `all`; espera al cambio de minuto, ~1 min). **Trampas:** `pkill -f next-server` mata el propio shell (usa `serve.sh`);
  `/admin` exige 2FA, por eso el E2E comprueba las métricas en BD y no la pantalla; `/api/health` no pasa por `route()` y no cuenta en las métricas.
  Fuera: `loadClubPanel` y `previewAssignment` sin caso en el test de privacidad; P2/P3 intactos.

## Decisiones tomadas
- LEAF-Q: se mantiene el cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local
  fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS por ahora (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava fuera de la IA y de la entrenadora.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
