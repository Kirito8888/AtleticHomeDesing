# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión fusionada:** v2.0 (14/10/2026); v2.1.0 pendiente de fusionar. CI en verde.
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final.
- **Arreglo /settings («This page couldn't load») — HECHO, causa NO reproducida.** El texto sin *digest* indica excepción **en cliente**. Con usuaria vacía, ADMIN con 2FA y cuentas con Telegram/Strava/IA/passkey/push en BD local (390 px) la página carga sin errores. Endurecido: `settings/error.tsx` (boundary con «Reintentar»; si es `ChunkLoadError` recarga), `lib/settings/optional.ts` (los bloques opcionales fallan a un valor de reserva; no se envuelven `totpStatus` ni `auditIntegrity` para no mentir sobre seguridad) y `shortWhen` en `server-status.tsx` (`Intl.format` lanzaba RangeError con fecha inválida). Si vuelve a fallar en producción: el boundary muestra el código del error; recargar con Ctrl+F5 por si son chunks viejos tras actualizar.
- **Bloque en curso:** ninguno. v2.0 y **v2.1 cerradas** (v2.1.0 en PR abierto a main, la usuaria lo fusiona). Siguiente: v2.2, por definir con la usuaria.

## Bloque Salto (hecho, fuera de la lista A–E)
Medidor de salto por tiempo de vuelo en vídeo (Balsalobre-Fernández 2015): `src/lib/training/jump.ts` (fórmulas puras,
tests), API `api/training/tests/jump` (recalcula en servidor y guarda **mejor** y **media** como dos tests del catálogo:
`cmj`/`sj`/`abalakov`/`djRsi` y `…Mean`), UI `components/training/jump-meter.tsx` en `/training/tests/salto`, E2E `e2e:salto`.
Sin cambios de esquema. El vídeo nunca sale del navegador. Los fps detectados son los **del fichero** (pueden ser 30 si el móvil
reexportó la cámara lenta): la atleta confirma los fps de captura. Fuera: perfil F-V (Samozino) y detección automática.

## v2.0 · bloques (resumen; detalle en CHANGELOG y código)
- **A · Clubes y cuotas** (`src/lib/clubs/`, `/clubs`): pertenecer no da acceso; la atleta acepta y elige `scopes`/`canPlan`. `resolveAthleteId` une
  vínculo 1:1 y clubes; `processingRestrictedAt` bloquea siempre (el ADMIN global se lo salta aquí por comportamiento previo). Sin eventos de auditoría de club.
- **B · Varias atletas + «qué pasa si»** (`/coach/multi`, `coach/what-if.ts`): un borrador por atleta, la atleta activa; sin escrituras en la simulación; el ADMIN global no se salta nada.
- **C · Flashcards compartidas**: `FlashcardReview` por persona (el SM-2 ya no vive en `Flashcard`, columnas legado). SQL de datos en
  `prisma/data-migrations/<migración>.sql`, que `regen-mig.sh` añade al final; `snapshot.sh --before <migración>` deja la foto previa a esa migración.
- **D · VFC del PDF y tendencias**: `ParsedWeek.hrv`; sin semanas marcadas no hay aviso semanal de VFC. Tendencias en `/recovery/trends`, umbrales en prefs, nada a la IA.
- **E · Varias réplicas**: `withJobLock` (advisory locks) en scheduler y Telegram; límite de peticiones en Postgres con HMAC. Pendiente: `admin/watch.ts`, `admin/metrics.ts` y `weather.ts` siguen en memoria por réplica.
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

## Decisiones tomadas
- LEAF-Q: se mantiene el cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local
  fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS por ahora (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava fuera de la IA y de la entrenadora.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
