# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión fusionada:** v1.10 (PR #24, 14/10/2026). CI en verde.
- **Siguiente:** v2.0, por bloques; **una sesión por bloque**. Cierre con PR al final de la versión.
- **Bloque en curso:** ninguno. Hecho: **Salto**, **A–E** y cierre v2.0. **v2.1 bloque 1 hecho (PR abierto).** Siguiente: v2.1 bloque 2 (biblioteca de ejercicios con vídeo).

## Bloque Salto (hecho, fuera de la lista A–E)
Medidor de salto por tiempo de vuelo en vídeo (Balsalobre-Fernández 2015): `src/lib/training/jump.ts` (fórmulas puras,
tests), API `api/training/tests/jump` (recalcula en servidor y guarda **mejor** y **media** como dos tests del catálogo:
`cmj`/`sj`/`abalakov`/`djRsi` y `…Mean`), UI `components/training/jump-meter.tsx` en `/training/tests/salto`, E2E `e2e:salto`.
Sin cambios de esquema. El vídeo nunca sale del navegador. Los fps detectados son los **del fichero** (pueden ser 30 si el móvil
reexportó la cámara lenta): la atleta confirma los fps de captura. Fuera: perfil F-V (Samozino) y detección automática.

## v2.0 · bloques (en orden)
Antes del bloque A: `scripts/dev/snapshot.sh` (foto de la BD v1.10 para la migración `v2_0_features`).

- **A · Clubes y cuotas internas — HECHO.** `Organization`, `OrgMember` (ADMIN/COACH/ATHLETE; estado PENDING→ACTIVE), `OrgFee`
  (migración `20270101080000_v2_0_features`, ya creada: en el cierre solo se regenera con `regen-mig.sh` si B toca el esquema).
  **Consentimiento:** pertenecer a un club no da acceso; la atleta acepta y elige `scopes`/`canPlan` (como `CoachAthlete`).
  `resolveAthleteId` (`auth/session.ts`) une vínculo 1:1 y clubes (`mergeGrants`); `processingRestrictedAt` bloquea siempre.
  Lógica en `src/lib/clubs/` (`service`, `club-panel`, `fees`), API `api/clubs/…`, UI `/clubs` y `/clubs/[id]`, E2E `e2e:v20a`.
  Cuotas: solo la ADMIN del club apunta/marca; la atleta ve las suyas; la entrenadora no las ve. Sin pasarela ni email.
  Pendiente/decisión: el ADMIN **global** sigue saltándose `processingRestrictedAt` (comportamiento previo, no tocado);
  no se registran eventos de auditoría de club (habría que ampliar el enum `SecurityEventType`).
- **B · Planificar varios atletas + «qué pasa si» — HECHO.** Sin cambios de esquema (no hay migración nueva).
  `/coach/multi`: la entrenadora copia una semana tipo (`WeekTemplate`) o un plan propio a N atletas; se crea **un borrador
  por atleta** (`createManualDraftFromDays`, `PlanMeso.meta.assignedById`), sin sesiones ni activar: la atleta lo activa.
  Solo con vínculo activo (1:1 o club) + ámbito PLANNING + `canPlan`; `processingRestrictedAt` bloquea; el ADMIN global aquí
  **no** se salta nada. Simulación sin escrituras (`projectPmc` en `training/pmc.ts`, `coach/what-if.ts`): base, con copia,
  con afinamiento (`taperProposal`) y recolocando choques (`rescheduleOptions` sin exámenes ni ciclo); requiere ámbito LOAD.
  TSS previsto = `tss` guardado o sRPE con el RPE que elige la entrenadora. API `api/coach/multi-plan` (apply exige `confirm`).
  Tests: `pmc.test.ts`, `what-if.test.ts`, `multi-plan.int.test.ts`; E2E `e2e:v20b`. Fuera: `saveDraftPlan` (plan con IA)
  como origen — solo se copian semanas tipo y planes propios.
- **C · Flashcards compartidas — HECHO.** Migración `20270101080000_v2_0_features` (ahora A + C): `FlashcardReview(userId, cardId,
  easeFactor, intervalDays, repetitions, dueAt, lastReviewedAt, lastGrade)` y `FlashcardDeckShare(deckId, userId)`. El SM-2 ya no
  se lee ni escribe en `Flashcard` (sus columnas quedan como legado; borrarlas sería no aditivo). Sin fila de review = tarjeta nueva.
  **SQL de datos** (estado de cada `Flashcard` → review de la dueña, idempotente) en `prisma/data-migrations/<migración>.sql`:
  `regen-mig.sh` lo añade al final del `migration.sql` en cada regeneración. `snapshot.sh --before <migración>` deja la foto como
  antes de esa migración (necesario: si no, regenerar perdería las tablas del bloque A). Para el cierre: `snapshot.sh --before
  20270101080000_v2_0_features` ya está hecho en esta sesión, pero /tmp no persiste: repetirlo antes de `regen-mig.sh` si hay más cambios de esquema.
  Lógica en `ai/sm2.ts` (`nextReview`, pura) y `ai/flashcards.ts` (`deckAccess`, `assertDeckOwner`, `reviewFlashcard`, `dueCards`,
  `listDecks`, compartir/quitar/dejar). La invitada repasa (progreso propio) pero edita/borra → 403; quien no ve el mazo → 404.
  Compartir por email con 404 genérico. La dueña no ve el progreso de las invitadas. Quitar el acceso borra el progreso de la invitada
  en ese mazo. La IA que genera tarjetas, sin cambios. UI: «Mis mazos» / «Compartidos conmigo» + panel Compartir
  (`components/study/deck-shares.tsx`). Exportar cuenta incluye solo mis reviews. Tests: `sm2.test.ts`, `flashcards.int.test.ts`; E2E `e2e:v20c`.
  Fuera/pendiente: el examen simulado ya admite mazos compartidos; no hay aviso a la invitada (sin email).
- **D · Tendencias y semanas de VFC del PDF — HECHO.** Sin cambios de esquema (`PlanMeso.weeks` es Json: `ParsedWeek.hrv?`).
  `parse.ts` marca `hrv` si el encabezado de la semana lleva «VFC» o su texto dice «semana VFC», «(VFC)» o empieza por «VFC:»
  (`isHrvWeek`); mencionar la VFC sin más no marca. Planes antiguos sin `hrv` = sin semanas marcadas. El MICRO de la semana lleva «· VFC»
  y el calendario pinta una etiqueta «VFC» en sus días (`plan-import/hrv-weeks.ts`, solo planes ACTIVE y variante elegida).
  **Regla** (`rules/engine.ts`): el aviso de caída de VFC (`prefs.hrvDropPct`) solo salta en la semana de hoy si está marcada y tiene
  ≥ 3 mañanas; base = media de las semanas previas con ≥ 3 mañanas (basta 1); el mensaje trae medias, nº de semanas y umbral.
  **Decisión:** sin ninguna semana marcada en el plan no hay aviso semanal de VFC (antes saltaba con cualquier semana).
  **Tendencias** `/recovery/trends` + `GET /api/recovery/trends`: `recovery/trends.ts` (puro) y `trends-service.ts`. Por mes: sueño, VFC,
  carga sRPE semanal, días con molestia (sesiones, squeeze, talón sobre tus umbrales). Compara el último mes con datos suficientes con la
  media de los anteriores (mín. 2 meses de base, 7 noches / 3 mañanas por mes) y avisa con causa + valores + umbral; si coinciden ≥ 2,
  aviso combinado. Umbrales nuevos en prefs (`trendMonths/SleepDropH/HrvDropPct/LoadRisePct/PainDaysRise`, en Mis reglas). La VFC de
  tendencias usa todas las mañanas, no solo las de semanas marcadas. Solo datos sin cifrar; nada a la IA ni a la entrenadora.
  Tests: `plan-import.test.ts`, `engine.test.ts`, `trends.test.ts`, `trends.int.test.ts`; E2E `e2e:v20d`.
- **E · Varias réplicas — HECHO.** Sin cambios de esquema (`RateLimitHit` ya existía). `src/lib/job-lock.ts`: `withJobLock(nombre, fn)` con
  `pg_try_advisory_lock(20020, hashtext(nombre))` en una conexión propia (`pg.Pool` de 2; el pool de Prisma no garantiza lock/unlock en la
  misma conexión) y `pg_advisory_unlock` en `finally` (si falla, se destruye la conexión y Postgres suelta el cerrojo). `scheduler.ts`:
  cada tarea de `tick()` y `safetyTick()` lleva su cerrojo (`job(nombre, fn)`); los timers de proceso siguen en `globalThis` a propósito.
  Telegram (`link.ts`): sin `globalThis`; `pollTelegram` bajo el cerrojo `telegram-poll` y el offset lo guarda Telegram (se confirma el
  lote con `offset = último+1`). **Decisión:** entrega «al menos una vez» (si muere entre procesar y confirmar, el `/start` se repite y
  responde «código no vale»; `/stop` es idempotente). Límite: `enforceRateLimit` es ahora **async** y usa `rateLimitPersistent` (Postgres,
  `INSERT … ON CONFLICT` atómico) en las 36 rutas + `csp-report`; `rate-limit.ts` queda solo como respaldo si la BD falla (+ `LIMITS`,
  `clientIp`). La clave se guarda como HMAC-SHA256(`AUTH_SECRET`) (SHA-256 sin secreto): ya no hay IPs ni ids en claro; al desplegar los
  contadores vigentes se reinician. Ventana **fija** (en el borde caben hasta 2× el límite). Tests: `job-lock.int.test.ts`,
  `rate-limit-db.int.test.ts`, `telegram.int.test.ts`, `ops.int.test.ts`; E2E `e2e:v20e` (también en `e2e.sh all`).
  Pendiente (no tocado): `admin/watch.ts`, `admin/metrics.ts` y `weather.ts` siguen en memoria por réplica (un aviso de vigilancia
  podría repetirse si alternan réplicas).
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
- **2 · Biblioteca de ejercicios con vídeo propio** (`Exercise` sin descripción ni vídeo; `sealed-files` solo admite imágenes y PDF).
- **3 · Comparativas con curvas publicadas y citadas; protocolos de fisio compartidos.**

## Decisiones tomadas
- LEAF-Q: se mantiene el cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local
  fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS por ahora (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava fuera de la IA y de la entrenadora.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
