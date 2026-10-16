# Propuesta v2.2 · auditoría técnica y funcional

> Bloque de auditoría (15/10/2026). Solo lectura del código: no se ha cambiado nada de la app ni de la BD.
> Confianza: **[Seguro]** = leído en el código; **[Probable]** = inferencia sólida; **[Suponiendo]** = sin medir.
> Coste: **S** pequeño (≤ medio día) · **M** mediano (≈ 1 bloque) · **G** grande (varios bloques).
> Decisiones fijas respetadas: PWA (sin apps nativas), sin pagos/Stripe, salud y Strava nunca a la IA ni al exterior.

## Lo incómodo primero

1. **[Seguro]** La regla «lo importado de Strava no va a la entrenadora» **no se cumple** en las vistas de la entrenadora:
   solo la cumplen `api/training/sessions*` y `clubs/club-panel.ts`. Es la única violación de una regla fija que he encontrado.
2. **[Seguro]** `docs/estado.md` anuncia «Pendiente: `admin/watch.ts`, `metrics.ts`, `weather.ts` en memoria por réplica»,
   pero el problema real es peor de lo que sugiere: `withJobLock` hace que el aviso lo ejecute **una réplica cualquiera en cada tick**,
   así que el estado en memoria de `watch.ts` se reparte entre réplicas y se contradice (ver P1-2).
3. **[Seguro]** No hay TODO/FIXME reales en `src/` ni en `schema.prisma` (los `TODO` son el enum `TaskStatus`/estado de tareas).
   La deuda vive en `estado.md`, no en el código: bien, pero obliga a mantener `estado.md` como fuente de verdad.
4. **[Probable]** La cobertura «pista» de v2.1 es de **captura y visualización**, no de **protección ni de plan**: el motor de reglas
   y el plan IA siguen pensados para lanzadoras. Una velocista no recibe ninguna alerta de carga específica.

---

## P1 · Alta: integridad, seguridad, privacidad, rendimiento crítico

> **✅ P1-1 … P1-5 resueltos en el bloque 1 de v2.2** (PR de la rama `claude/tender-curie-ghzp04`). Notas de la implementación:
> - **P1-1** se amplió con tres fugas más de la misma regla: el *informe compartido por enlace* (`report/service.ts`), la *carga* (`/api/training/pmc`
>   y la semilla de `coach/multi-plan.ts`: con Strava en la ventana se oculta/no se simula, como ya hacía la IA) y las *marcas* (`/api/training/records`).
>   Los cargadores viven en `coach/overview.ts`; helpers en `strava/policy.ts` (`visibleTo`, `prNotFromStrava`, `hasStravaIn`).
> - **P1-2** `WatchAlert` y `ApiMetricMinute` (migración `20270301080000_v2_2_features`, aditiva). `weather.ts` (P2-8) sigue en memoria, aceptado.
> - **P1-3** `src/lib/strava/privacy.int.test.ts` (falla 5/5 si `notFromStrava` se vacía). Queda fuera del test `loadClubPanel` y `previewAssignment`.
> - **P1-4** `AthleteProfile` se restaura (con `prefs`); vídeos y lo compartido siguen sin restaurarse y la pantalla lo dice.
> - **P1-5** `scripts/dev/synthetic-data.sql` (120 sesiones, series, intervalos, marcas, carga, vínculo; todo `syn-…` / `@example.invalid`).

| # | Mejora | Por qué | Ficheros | Coste |
|---|---|---|---|---|
| ~~P1-1~~ ✅ | ~~**Filtrar Strava en las vistas de la entrenadora**~~ — resuelto (v2.2 b1) | Regla fija rota **[Seguro]**. `/coach` lista y compara 30 días de sesiones sin `notFromStrava` (incl. `tss`, `sessionRpe`, `bestMarkM`) y `/coach/session/[id]` abre cualquier sesión por id; el hilo de comentarios (`sessionThread`) también. | `src/app/(app)/coach/page.tsx:26`, `src/app/(app)/coach/session/[id]/page.tsx:30`, `src/lib/training/comments-service.ts:15`, `src/lib/coach/compare.ts`; helper existente `src/lib/strava/policy.ts:7`; `api/training/records/route.ts` (revisar `PersonalRecord` con `sessionId` de Strava) | S–M |
| ~~P1-2~~ ✅ | ~~**Vigilancia y métricas admin en BD, no en memoria**~~ — resuelto (v2.2 b1) | `runWatchJob` guarda lo ya avisado en `globalThis.__lifeosWatch`; el scheduler lo lanza bajo `withJobLock` (`scheduler.ts:306,357`), que puede caer en otra réplica cada vez → avisos repetidos, «resuelto» falso o ausente **[Probable]**. `metrics.ts:8` cuenta los 5xx por réplica, así que `ERROR_SPIKE` (10/h) se infra-detecta **[Seguro]**. | `src/lib/admin/watch.ts:50`, `src/lib/admin/metrics.ts:8`, `src/lib/scheduler.ts`; nueva tabla aditiva (`WatchState`, `MetricBucket`) en la migración v2.2 | M |
| ~~P1-3~~ ✅ | ~~**Test de privacidad transversal**~~ — resuelto (v2.2 b1) | Hoy cada ruta se acuerda de `notFromStrava` por su cuenta (7 ficheros); P1-1 prueba que se olvida. Un test de integración que cree una sesión `source: STRAVA` y recorra todas las vistas/API de entrenadora y rutas de IA (`ai/coach.ts`, `ai/data-ai.ts`, `ai-plan/*`) evita regresiones. | nuevo `src/lib/strava/privacy.int.test.ts`; `e2e/` | S–M |
| ~~P1-4~~ ✅ | ~~**Restaurar cuenta pierde datos**~~ — resuelto (v2.2 b1) | `AthleteProfile` (prueba, disciplinas, constantes CTL/ATL) no se restaura; vídeos y compartidos tampoco (documentado en `estado.md`). Una restauración «completa» que descarta el perfil es una trampa de integridad **[Seguro]**. Mínimo: restaurar `AthleteProfile`; documentar claramente el resto en la pantalla. | `src/lib/account/` (`restore*.ts`, `session-snapshot.ts`), `src/lib/account/service.ts:99` | S |
| ~~P1-5~~ ✅ | ~~**`test-migration.sh` con datos sintéticos**~~ — resuelto (v2.2 b1) | La BD de dev tiene 0 usuarias/sesiones: prueba el esquema, no la conservación de datos (límite reconocido en el cierre v2.1). Con migración v2.2 aditiva y nuevas tablas, conviene una foto sintética anonimizada (sin datos reales). | `scripts/dev/test-migration.sh`, `scripts/dev/snapshot.sh`, `prisma/seed*` | M |

## P2 · Media: UX a 390 px, arquitectura y disciplinas

> **✅ P2-1 … P2-9 resueltos en el bloque 2 de v2.2** (rama `claude/determined-planck-j8n3as`; las dos mitades del plan original —bloques 3 y 4— se hicieron juntas). Notas:
> - **P2-1** 8 tablas envueltas en `overflow-x-auto` (la de `pmc-charts` ya tenía `overflow-auto`). Suite `e2e:v22b`: 55 rutas a 390 px en claro y oscuro sin scroll horizontal. Objetivo táctil de 44 px **por debajo de `md`** en `Button`, `Input`, `Select`, `Chips`, `Stepper`, `Tabs`, `Switch` (zona ampliada) y varios botones sueltos; el E2E lista los que aún quedan (3 en `/settings`) como aviso, no como fallo.
> - **P2-2** las 4 rejillas pasan a `grid-cols-2 sm:grid-cols-4`.
> - **P2-3** PR `TRACK_TIME` por distancia (menor es mejor) solo de series escritas a mano en SPRINT/HURDLES/RUN; las importaciones (archivo y Strava) no traen series, así que no generan PR.
> - **P2-4 (acotado)** tres reglas con umbrales en prefs (`sprintVolumeRatio`, `kmRampPct`+`kmRampMinKm`, `jumpCapRatio`), visibles en «Mis reglas». **No incluye** más reglas por familia (combinadas, vídeo de saltos…). Los datos de pista **excluyen Strava** porque estos avisos llegan a la entrenadora y a la IA: un fondista que solo usa Strava no recibe el aviso de km.
> - **P2-5** el asistente parte de la familia de la prueba y el prompt añade «prueba principal» (solo la clave del catálogo).
> - **P2-6** temporadas compara también tiempos de pista y solo muestra las 6 últimas.
> - **P2-7 (acotado)** consultas serie → paralelo en `settings` y `planning`, `take` en ejercicios propios, temporadas acotadas. **Sin medir** (P3-1): no hay cifra de mejora.
> - **P2-8** aceptado: el tiempo sigue en caché por réplica (sin riesgo de datos).
> - **P2-9** la bienvenida pide «Mi prueba» (opcional).

| # | Mejora | Por qué | Ficheros | Coste |
|---|---|---|---|---|
| ~~P2-1~~ ✅ | ~~**Barrido E2E de desbordamiento a 390 px**~~ — resuelto (v2.2 b2) | 11 ficheros con `<table>` no tienen `overflow-x-auto` **[Seguro]**: `competition/attempt-sheet.tsx`, `training/pmc-charts.tsx`, `study/exam-plan.tsx`, `nutrition/planning.tsx`, `planning/meso/[code]/page.tsx`, `training/routine/[id]/page.tsx`, `training/compare/page.tsx`, `settings/page.tsx`, `recovery/page.tsx` (+ 2 `print/*`, que no importan). Solo algunas suites (`v20a-c`, `smoke`) miden `scrollWidth`; no hay barrido de todas las rutas. | `e2e/` (nueva suite que recorra rutas), los ficheros citados | M |
| ~~P2-2~~ ✅ | ~~**Rejillas fijas de 4 columnas en móvil**~~ — resuelto (v2.2 b2) | `grid grid-cols-4` con `<Input>` y placeholders largos («80 % o 60 kg») queda ilegible a 390 px **[Probable]**: `planning/manual-plan.tsx:133`, `competition/competition-tools.tsx:28`, `training/[id]/page.tsx:245`, `nutrition/kitchen.tsx:213`. Pasar a `grid-cols-2 sm:grid-cols-4`. | los citados | S |
| ~~P2-3~~ ✅ | ~~**`TRACK_TIME` al guardar sesiones de pista**~~ — resuelto (v2.2 b2) | `season-report.ts:40` y `training/page.tsx:174` ya leen `PersonalRecord.kind = "TRACK_TIME"`, pero `training/service.ts` solo crea `TECHNICAL_MARK` **[Seguro]** (ya anotado en `estado.md`). Sin esto, el informe de temporada de una velocista sale sin marcas. Un PR de tiempo es «menor es mejor». | `src/lib/training/service.ts` (~l. 296–350), `training/disciplines.ts` (`intervalMetric`) | S–M |
| ~~P2-4~~ ✅ | ~~**Motor de reglas por familia de prueba**~~ — resuelto (v2.2 b2) | `rules/engine.ts` solo conoce `ThrowSession` (`throwCap`, `throw-48h`, vídeo codo/cabeza); `rules-service.ts` carga todo como lanzamientos. Falta, p. ej., volumen a alta velocidad semanal, ratio de aumento de km en fondo, saltos por semana. Umbrales **en prefs**, no en código (regla fija); `familyOf` ya existe. | `src/lib/rules/engine.ts`, `rules-service.ts`, `rules/prefs.ts`, `training/disciplines.ts`; `training/page.tsx` (`throwWeeks`) | G |
| ~~P2-5~~ ✅ | ~~**Plan IA con la prueba de la atleta**~~ — resuelto (v2.2 b2) | Las disciplinas del asistente son 5 genéricas (`ai-plan/options.ts:20`) y no se parte de `primaryEvent`/familia. Preseleccionar desde el perfil (solo la familia/prueba, **sin datos de salud ni Strava**) y adaptar el prompt. | `src/lib/ai-plan/options.ts`, `prompt.ts`, `plan-wizard.tsx`, `training/disciplines.ts` | S–M |
| ~~P2-6~~ ✅ | ~~**Comparar temporadas incluye pista**~~ — resuelto (v2.2 b2) | `training/seasons/page.tsx:16` solo selecciona `technical` (mejor marca, intentos): una sesión de pista no aporta. | `src/app/(app)/training/seasons/page.tsx`, `training/season-report.ts` | S |
| ~~P2-7~~ ✅ | ~~**Consultas sin límite en páginas**~~ — resuelto (v2.2 b2) | 52 de 59 `findMany` en `src/app` no usan `take` **[Seguro]** (muchos son acotados por fecha o por `select`). Casos reales: `training/seasons` trae todas las sesiones completadas; `planning/page.tsx` hace 7 consultas por carga; `settings/page.tsx` 17 `await`. Impacto en móvil: TTFB, no ancho de banda **[Suponiendo]** hasta medir. Medir primero (P3-1). | `training/seasons/page.tsx`, `planning/page.tsx`, `settings/page.tsx` | M |
| ~~P2-8~~ ✅ | ~~**Caché de tiempo en BD**~~ — resuelto (v2.2 b2) | `weather.ts:33` (caché 1 h por réplica): coste real mínimo (más llamadas a Open-Meteo), pero es la tercera pieza de la deuda de `estado.md`. Opción más barata: aceptar y documentarlo. Recomiendo **aceptarlo**: no hay riesgo de datos. | `src/lib/weather.ts` | S |
| ~~P2-9~~ ✅ | ~~**Asistente de bienvenida pide la prueba**~~ — resuelto (v2.2 b2) | Hoy solo se fija en Ajustes; una atleta nueva ve Fuerza por defecto. | `src/app/(app)/training/new/page.tsx`, `components/settings/settings-forms.tsx`, asistente de bienvenida | S |

## P3 · Baja: secundarias y optimizaciones menores

| # | Mejora | Ficheros | Coste |
|---|---|---|---|
| P3-1 | **Medir antes de optimizar**: analizar el bundle (`next build`) y los tiempos de las páginas pesadas a 390 px; recharts ya va diferido (`components/charts/lazy.tsx`), 144 componentes `"use client"` | `next.config.ts` | S |
| P3-2 | Borrado de ejercicios propios (+ borrar el clip cifrado) | `training/exercise-library.ts`, `api/training/exercises/[id]` | S |
| P3-3 | Aviso a la atleta al compartir un protocolo de fisio (push/Telegram, sin email) | `recovery/physio-service.ts`, `lib/push/` | S |
| P3-4 | Probar HEVC/.mov reales en Safari iOS (medidor de salto): checklist manual, no código | `components/training/jump-meter.tsx` | S |
| P3-5 | Eventos de auditoría de club (aceptar/abandonar/cambiar ámbitos) | `src/lib/clubs/` | S |
| P3-6 | Objetivo táctil ≥ 44 px en la tira semanal (`grid-cols-7` a 390 px) | `components/training/week-strip.tsx`, `planning/page.tsx:141` | S |

---

## Bloques v2.2 propuestos (para decidir con la usuaria)

1. **Bloque 1 · Privacidad e integridad** (P1-1, P1-3, P1-4): corregir la fuga de Strava a la entrenadora con test transversal y restaurar el perfil. Sin migración.
2. **Bloque 2 · Vigilancia multi-réplica** (P1-2, P1-5; opcionalmente P2-8): estado y métricas en Postgres. Migración aditiva `…_v2_2_features`.
3. **Bloque 3 · Pista de verdad** (P2-3, P2-6, P2-5, P2-9 y, si hay presupuesto, P2-4): PR de tiempo, temporadas, plan IA y, después, reglas por familia.
4. **Bloque 4 · Móvil a 390 px** (P2-1, P2-2, P3-6, P3-1, luego P2-7): barrido E2E primero, arreglos después, medición antes de tocar consultas.

Orden recomendado: 1 → 2 → 3 → 4. **Riesgo de saltarse 1:** mientras no se arregle, cualquier entrenadora con vínculo SESSIONS ve actividad importada de Strava.

## Fuera de alcance (decisiones fijas)

Apps nativas, pagos/Stripe, email, BEDCA, y cualquier envío de salud cifrada o de datos de Strava a IA, entrenadora o exterior.
