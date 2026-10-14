# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión fusionada:** v1.10 (PR #24, 14/10/2026). CI en verde.
- **Siguiente:** v2.0, por bloques; **una sesión por bloque**. Cierre con PR al final de la versión.
- **Bloque en curso:** ninguno. Hecho: **Salto**, **A**, **B** (fusionados) y **C (flashcards compartidas)** (PR pendiente). **Siguiente: D.**

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
- **D · Tendencias y semanas de VFC del PDF.** El lector (`planning/plan-import/parse.ts`) no detecta «VFC»; la alerta de
  `rules/engine.ts` (~l.170) usa cualquier semana con ≥ 3 mañanas (el comentario de `prefs.hrvDropPct` habla de «semana
  marcada»). Marcar semanas VFC al importar y usarlas. Tendencias de meses (sueño, VFC, carga, molestias) con alertas explicables.
- **E · Varias réplicas.** Planificador sin bloqueo (`src/lib/scheduler.ts`): `pg_advisory_lock` por tarea; sondeo de
  Telegram con estado en `globalThis` (`telegram/link.ts`); limitador en memoria (`rate-limit.ts`) → `rate-limit-db.ts`
  donde importe. pg-boss ya es seguro entre réplicas.
- **Cierre v2.0:** export/restaurar, CHANGELOG, guía, manual «De v1.10 a v2.0», `test-migration.sh`, todas las E2E, PR.

## v2.1 (después)
Más disciplinas (enum `Discipline` ya existe; la lógica es de lanzamientos: `javelin-insights.ts`, reglas de
`rules/engine.ts`), biblioteca de ejercicios con vídeo propio (`Exercise` no tiene descripción ni vídeo; `sealed-files`
solo admite imágenes y PDF), comparativas con curvas publicadas y citadas, protocolos de fisio compartidos.

## Decisiones tomadas
- LEAF-Q: se mantiene el cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local
  fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS por ahora (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava fuera de la IA y de la entrenadora.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
