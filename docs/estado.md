# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión fusionada:** v1.10 (PR #24, 14/10/2026). CI en verde.
- **Siguiente:** v2.0, por bloques; **una sesión por bloque**. Cierre con PR al final de la versión.
- **Bloque en curso:** ninguno. Hecho: **Salto** (medidor de salto por vídeo, PR pendiente de fusionar). **A (clubes)** se aplaza; sigue pendiente.

## Bloque Salto (hecho, fuera de la lista A–E)
Medidor de salto por tiempo de vuelo en vídeo (Balsalobre-Fernández 2015): `src/lib/training/jump.ts` (fórmulas puras,
tests), API `api/training/tests/jump` (recalcula en servidor y guarda **mejor** y **media** como dos tests del catálogo:
`cmj`/`sj`/`abalakov`/`djRsi` y `…Mean`), UI `components/training/jump-meter.tsx` en `/training/tests/salto`, E2E `e2e:salto`.
Sin cambios de esquema. El vídeo nunca sale del navegador. Los fps detectados son los **del fichero** (pueden ser 30 si el móvil
reexportó la cámara lenta): la atleta confirma los fps de captura. Fuera: perfil F-V (Samozino) y detección automática.

## v2.0 · bloques (en orden)
Antes del bloque A: `scripts/dev/snapshot.sh` (foto de la BD v1.10 para la migración `v2_0_features`).

- **A · Clubes y cuotas internas.** Modelos `Organization` + `OrgMember` (rol en el club: ADMIN, COACH, ATHLETE).
  Panel de club: cumplimiento, alertas, calendario de grupo y registro interno de cuotas (sin pasarela de pago).
  Hoy solo existe `CoachAthlete` (1:1, `scopes` + `canPlan`). El punto único de permisos es
  `resolveAthleteId(user, athleteId, scope, mode)` en `src/lib/auth/session.ts`: ampliarlo, no duplicarlo.
  `processingRestrictedAt` (RGPD art. 18) sigue bloqueando todo. Vista de coach actual: `src/app/(app)/coach/page.tsx`,
  `src/lib/coach/compare.ts`.
- **B · Planificar varios atletas + «qué pasa si».** Copiar plan/plantilla a N atletas con `canPlan` (hoy todo es por
  `userId`: `src/lib/planning/manual-plan.ts`, `ai-plan/service.ts` `saveDraftPlan`, `WeekTemplate`). Simulación en
  borrador: `computePmc` (`src/lib/training/pmc.ts`) con TSS futuro de sesiones PLANNED, sembrado con CTL/ATL de hoy;
  reutilizar `taperProposal` (`planning/taper-service.ts`) y `rescheduleOptions` (`planning/reschedule.ts`).
- **C · Flashcards compartidas.** El estado SM-2 vive en `Flashcard` (por tarjeta): crear `FlashcardReview(userId, cardId, …)`
  y migrar el estado existente al dueño del mazo. Compartir mazo con personas autorizadas (solo lectura del contenido).
  Código: `src/lib/ai/flashcards.ts`, `sm2.ts`.
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
