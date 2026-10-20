# TTFB a 390 px · v2.4 bloque 1

Medida, no optimización: no se ha tocado código de producto. Script: `e2e/v24a.mts` (`npm run e2e:v24a`; opciones `TTFB_RUNS`,
`TTFB_QUERIES=1`, `TTFB_OUT`). Reproducir: `npm run build && sh scripts/dev/serve.sh true`, luego
`TTFB_QUERIES=1 TTFB_OUT=docs/ttfb-v2-4.md npm run e2e:v24a` (necesita VAPID en `.env.local`).

## Cómo se midió y qué NO dice
- Sesión sintética completa: 180 entrenos (60 fuerza de 12 series cada una · 60 técnica de jabalina con 8 intentos · 60 pista con 6 intervalos), 6 tests, objetivo, competición, nutrición y cuenta de finanzas. Móvil 390×844, build de producción en `:3100`.
- TTFB = `responseStart − requestStart` de la navegación; «frío» = primera visita, mediana/p90 = 7 visitas siguientes. Claro y oscuro, cada uno con su sesión.
- **Claro/oscuro no son medidas distintas:** el tema lo decide `next-themes` en el cliente y el HTML del servidor es el mismo. La columna oscura es una réplica: la diferencia entre ambas (mediana global 20 vs 22 ms) es **ruido**, y entre dos ejecuciones completas la mediana de cada ruta se movió 4,5 ms (p90 de la diferencia: 15 ms). No saques conclusiones de diferencias menores de ~15 ms ni del orden dentro de la tabla.
- Los p90 con cientos de ms (`/training/performance` oscuro 1369, `/study/focus` claro 897, `/training/[id]` fuerza 526…) son picos aislados de una visita entre 7, no repetibles entre ejecuciones: contenedor, no ruta.
- **Contenedor ≠ servidor real:** Postgres está en el mismo equipo (latencia de red a la BD ≈ 0) y sin carga concurrente. La cifra absoluta no se traslada; el **número de consultas** sí.
- «Consultas SSR» y «ms BD» salen del log de Postgres con `fetch` de cliente a `/api/` bloqueados, así que solo cuentan el render del servidor. Cuenta sentencias en una visita; es un orden de magnitud, no un contador exacto. Algunas sentencias multilínea salen sin texto en el desglose (el script lee solo la primera línea); esos ~45 ms sueltos (`/training/performance`, `/study/focus`, `/search`) no se han atribuido.
- Rutas con id (`/training/[id]`…) se miden con ids sembrados; las que necesitan un plan importado del PDF, un club, un protocolo o 2FA no se miden (lista debajo de la tabla).

## Resultado
Ninguna ruta pasa de **~95 ms** de mediana (mediana global 20 ms, p90 45 ms, 71 rutas); las más lentas: `/training/diary` 93, `/training` 79, `/planning` 54, `/training/compare` 54, `/coach/multi` 53. El tiempo en BD por render es ≤ 28 ms salvo los picos citados. Con estas cifras, **el TTFB no es hoy un problema**.

<!-- ttfb:start -->
Medido el 2026-10-16 con 7 visitas por ruta, 390×844, sesión sintética de 180 entrenos.

| Ruta | HTTP | Frío (ms) | Claro mediana / p90 | Oscuro mediana / p90 | Consultas SSR | ms BD |
|---|---|---|---|---|---|---|
| `/training/diary` | 200 | 78 | 93 / 108 | 64 / 204 | 51 | 1.5 |
| `/training` | 200 | 158 | 79 / 129 | 48 / 69 | 56 | 5 |
| `/planning` | 200 | 95 | 54 / 62 | 48 / 109 | 67 | 11.6 |
| `/training/compare` | 200 | 37 | 54 / 69 | 45 / 118 | 19 | 0.3 |
| `/coach/multi` | 200 | 77 | 53 / 81 | 34 / 44 | 20 | 4.6 |
| `/training/[id]/edit` | 200 | 46 | 50 / 64 | 44 / 78 | 21 | 0.8 |
| `/` | 200 | 53 | 49 / 82 | 67 / 99 | 112 | 28 |
| `/training/[id] (fuerza)` | 200 | 177 | 45 / 526 | 25 / 32 | 38 | 2.1 |
| `/planning/week-all` | 200 | 37 | 42 / 62 | 40 / 59 | 31 | 0.5 |
| `/study/focus` | 200 | 28 | 42 / 897 | 20 / 24 | 30 | 47.5 |
| `/training/[id] (técnica)` | 200 | 28 | 35 / 54 | 31 / 65 | 40 | 3.6 |
| `/nutrition/micros` | 200 | 38 | 34 / 115 | 25 / 36 | 22 | 0.4 |
| `/training/performance` | 200 | 36 | 34 / 56 | 55 / 1369 | 39 | 51.3 |
| `/settings` | 200 | 66 | 33 / 67 | 41 / 50 | 39 | 7.4 |
| `/recovery/women` | 200 | 78 | 32 / 46 | 31 / 73 | 40 | 1.5 |
| `/training/javelin` | 200 | 42 | 32 / 49 | 39 / 62 | 28 | 2.1 |
| `/finance` | 200 | 34 | 31 / 47 | 35 / 66 | 65 | 2 |
| `/nutrition` | 200 | 95 | 30 / 76 | 31 / 60 | 47 | 1 |
| `/training/[id] (pista)` | 200 | 27 | 29 / 78 | 32 / 75 | 36 | 0.6 |
| `/training/new` | 200 | 72 | 29 / 59 | 31 / 41 | 39 | 2.6 |
| `/training/rm` | 200 | 25 | 28 / 57 | 20 / 30 | 30 | 1.1 |
| `/study` | 200 | 39 | 26 / 75 | 36 / 82 | 38 | 0.8 |
| `/recovery` | 200 | 68 | 25 / 53 | 55 / 97 | 51 | 1.1 |
| `/nutrition/sweat` | 200 | 41 | 24 / 42 | 26 / 469 | 20 | 3.3 |
| `/coach` | 200 | 78 | 24 / 42 | 32 / 53 | 31 | 0.4 |
| `/nutrition/shopping` | 200 | 44 | 24 / 29 | 21 / 83 | 20 | 0.3 |
| `/planning/plan/new` | 200 | 24 | 24 / 73 | 24 / 53 | 18 | 0.9 |
| `/study/plan` | 200 | 22 | 24 / 52 | 22 / 26 | 34 | 1.8 |
| `/training/equipment` | 200 | 21 | 24 / 37 | 17 / 54 | 20 | 0.3 |
| `/glance` | 200 | 26 | 22 / 154 | 27 / 37 | 53 | 0.7 |
| `/study/exam` | 200 | 19 | 22 / 27 | 21 / 36 | 24 | 0.3 |
| `/recovery/trends` | 200 | 20 | 22 / 29 | 22 / 49 | 22 | 0.4 |
| `/training/tests/salto` | 200 | 21 | 21 / 35 | 16 / 19 | 33 | 2.9 |
| `/study/exams` | 200 | 24 | 21 / 39 | 21 / 31 | 28 | 2.3 |
| `/training/exercises` | 200 | 29 | 21 / 26 | 22 / 56 | 44 | 1.9 |
| `/nutrition/plan` | 200 | 37 | 20 / 54 | 18 / 83 | 28 | 0.4 |
| `/training/seasons` | 200 | 23 | 20 / 26 | 32 / 77 | 23 | 1.3 |
| `/training/tests/comparar` | 200 | 20 | 20 / 28 | 17 / 19 | 25 | 0.4 |
| `/study/schedule` | 200 | 25 | 20 / 42 | 17 / 34 | 8 | 0.1 |
| `/nutrition/recipes` | 200 | 16 | 20 / 47 | 24 / 36 | 19 | 0.3 |
| `/training/routine` | 200 | 22 | 19 / 22 | 18 / 23 | 19 | 0.3 |
| `/review` | 200 | 22 | 19 / 25 | 25 / 31 | 29 | 0.5 |
| `/recovery/wellbeing` | 200 | 18 | 19 / 41 | 24 / 33 | 21 | 0.5 |
| `/settings/privacy` | 200 | 19 | 19 / 23 | 22 / 31 | 29 | 3.1 |
| `/clubs` | 200 | 17 | 19 / 22 | 18 / 28 | 33 | 0.5 |
| `/training/prehab` | 200 | 33 | 18 / 30 | 21 / 54 | 20 | 0.3 |
| `/training/exercises/[id]` | 200 | 23 | 18 / 40 | 32 / 81 | 24 | 0.5 |
| `/goals` | 200 | 16 | 18 / 24 | 19 / 28 | 28 | 0.5 |
| `/training/tests` | 200 | 23 | 18 / 28 | 21 / 36 | 32 | 0.8 |
| `/training/tests/curvas` | 200 | 18 | 18 / 30 | 18 / 23 | 25 | 0.3 |
| `/safety` | 200 | 23 | 18 / 21 | 17 / 26 | 11 | 0.1 |
| `/recovery/health` | 200 | 20 | 18 / 28 | 20 / 29 | 22 | 0.8 |
| `/finance/trips` | 200 | 18 | 17 / 30 | 32 / 171 | 27 | 0.3 |
| `/study/assignments` | 200 | 17 | 17 / 22 | 20 / 29 | 21 | 0.4 |
| `/study/ask` | 200 | 51 | 17 / 21 | 19 / 34 | 23 | 1.4 |
| `/about` | 200 | 15 | 17 / 21 | 16 / 21 | 20 | 0.3 |
| `/recovery/body` | 200 | 32 | 17 / 20 | 25 / 34 | 19 | 0.3 |
| `/print/season` | 200 | 16 | 16 / 28 | 19 / 34 | 9 | 0.2 |
| `/recovery/fisio` | 200 | 21 | 16 / 37 | 21 / 34 | 21 | 0.5 |
| `/notifications` | 200 | 16 | 16 / 22 | 19 / 25 | 31 | 28.4 |
| `/settings/trash` | 200 | 20 | 16 / 24 | 18 / 28 | 22 | 8.7 |
| `/welcome` | 200 | 32 | 16 / 21 | 24 / 32 | 25 | 0.4 |
| `/search` | 200 | 14 | 15 / 20 | 17 / 21 | 21 | 45.9 |
| `/share` | 200 | 20 | 15 / 31 | 20 / 34 | 21 | 2.1 |
| `/register` | 200 | 13 | 12 / 22 | 10 / 48 | 1 | 7.1 |
| `/legal/condiciones` | 200 | 9 | 11 / 27 | 11 / 27 | 0 | 0 |
| `/offline` | 200 | 13 | 11 / 43 | 10 / 30 | 3 | 23.6 |
| `/login` | 200 | 18 | 11 / 29 | 15 / 39 | 0 | 0 |
| `/legal/privacidad` | 200 | 11 | 9 / 17 | 12 / 30 | 0 | 0 |
| `/legal/aviso` | 200 | 9 | 9 / 22 | 12 / 21 | 0 | 0 |
| `/reset` | 200 | 10 | 9 / 15 | 12 / 20 | 0 | 0 |

No medidas:
- `/training/routine/[id]`: no medida: requiere cuestionario de rutina completo
- `/planning/plan/[id]`: no medida: requiere un plan importado del PDF
- `/planning/plan/[id]/edit`: no medida: requiere un plan importado del PDF
- `/planning/competition/[id]`: no medida: requiere competición con plan
- `/planning/meso/[code]`: no medida: requiere un plan importado del PDF
- `/print/plan/[id]`: no medida: requiere un plan importado del PDF
- `/clubs/[id]`: no medida: requiere club con miembros
- `/recovery/fisio/[id]`: no medida: requiere protocolo de fisio
- `/recovery/fisio/compartido/[shareId]`: no medida: requiere protocolo compartido
- `/coach/session/[id]`: no medida: requiere atleta vinculada a la entrenadora
- `/admin`: no medida: exige 2FA

Sentencias más caras de las 10 rutas más lentas:
- `/training/diary`
  - 43× 0.7 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.4 ms · SELECT "TrackInterval"."id", "TrackInterval"."distanceM", "TrackInterval"."timeSec", "TrackInterval"."trackSes
  - 1× 0.3 ms · SELECT "TrainingSession"."id", "TrainingSession"."date", "TrainingSession"."title", "TrainingSession"."notes",
- `/training`
  - 1× 0.9 ms · SELECT "TrainingSession"."id", "TrainingSession"."userId", "TrainingSession"."plannedById", "TrainingSession".
  - 1× 0.8 ms · SELECT "TechnicalSession"."id", "TechnicalSession"."isCompetition", "TechnicalSession"."videoTotal", "Technica
  - 1× 0.6 ms · SELECT "StrengthSession"."id", "StrengthSession"."tonnageKg", "StrengthSession"."sessionId", COALESCE("aggr_se
- `/planning`
  - 47× 9.3 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.9 ms · SELECT "ClassSlot"."id", "ClassSlot"."userId", "ClassSlot"."subject", "ClassSlot"."kind", "ClassSlot"."weekday
  - 1× 0.5 ms · SELECT "StrengthSession"."id", "StrengthSession"."tonnageKg", "StrengthSession"."sessionId", COALESCE("aggr_se
- `/training/compare`
  - 15× 0.2 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.0 ms · SELECT "TrainingSession"."id", "TrainingSession"."date", "TrainingSession"."title", "TrainingSession"."type"::
  - 1× 0.0 ms · SELECT COUNT(*) AS "_count$_all" FROM (SELECT "NotificationLog"."id" FROM "NotificationLog" WHERE ("Notificati
- `/coach/multi`
  - 4× 4.4 ms · 
  - 4× 0.1 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.0 ms · SELECT "WeekTemplate"."id", "WeekTemplate"."name" FROM "WeekTemplate" WHERE "WeekTemplate"."userId" = $ ORDER 
- `/training/[id]/edit`
  - 7× 0.3 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.2 ms · SELECT "StrengthSet"."id", "StrengthSet"."exerciseId", "StrengthSet"."weightKg", "StrengthSet"."velocityMs" FR
  - 1× 0.0 ms · SELECT "StrengthSet"."id", "StrengthSet"."strengthSessionId", "StrengthSet"."exerciseId", "StrengthSet"."order
- `/`
  - 1× 24.7 ms · SELECT "StrengthSet"."id", "StrengthSet"."exerciseId", "StrengthSet"."reps", "StrengthSet"."weightKg", "Streng
  - 40× 0.7 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.4 ms · 
- `/training/[id] (fuerza)`
  - 2× 1.3 ms · 
  - 17× 0.3 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.1 ms · SELECT "PersonalRecord"."id", "PersonalRecord"."userId", "PersonalRecord"."kind"::text, "PersonalRecord"."tech
- `/planning/week-all`
  - 21× 0.3 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.1 ms · SELECT "AthleteProfile"."id", "AthleteProfile"."prefs" FROM "AthleteProfile" WHERE ("AthleteProfile"."userId" 
  - 1× 0.0 ms · SELECT "Consent"."id", "Consent"."version", "Consent"."granted" FROM "Consent" WHERE ("Consent"."userId" = $ A
- `/study/focus`
  - 3× 47.1 ms · 
  - 19× 0.3 ms · SELECT "User"."id", "User"."sessionVersion", "User"."role"::text, "User"."email", "User"."name", "User"."suspe
  - 1× 0.0 ms · SELECT "StudyPlanBlock"."id", "StudyPlanBlock"."subject", "StudyPlanBlock"."minutes", "StudyPlanBlock"."done" 
<!-- ttfb:end -->

## Recomendación (sin implementar)
1. **[Seguro] Cada render hace 20–50 consultas a `User` idénticas, y es lo más barato de arreglar.** `src/auth.ts:188` (callback `jwt`) hace un `findUnique` de `User` en cada llamada a `auth()` (revocación por `sessionVersion`/suspensión) y esa llamada no se memoiza por petición: `/` 40 veces, `/planning` 47, `/study/focus` 19, `/search` 13 (con `SSR` solo, sin API). Cuesta 0,3–0,7 ms aquí, pero con la BD a 1–2 ms de red en el servidor real son 40–100 ms de TTFB en `/` y `/planning`. **Qué tocar:** envolver con `React.cache` la lectura de sesión (o `requireUser`/`pageUser`) para una sola comprobación por petición. Es una consulta, no un rediseño. [Probable] que las repeticiones vengan de `requireUser()` en servicios llamados desde la misma página; no he trazado cuántas salen de cada sitio.
2. **[Probable] Contrastar en el servidor real antes de tocar nada más.** Si allí `/` o `/planning` pasan de ~300 ms, el punto 1 es lo primero. Si no, **no optimizar**: el resto de rutas está por debajo de 100 ms con 25–65 consultas.
3. **[Suponiendo] Segundo candidato, solo si el punto 1 no basta:** `/` (112 consultas SSR) y `/planning` (67): quitado el `User`, quedan unas 70 y 20 consultas; mirar `getDashboard` (`src/lib/dashboard.ts`) y `/planning` por consultas secuenciales que puedan ir en `Promise.all`. No lo he leído; es hipótesis, y la única sentencia con coste visible es una lectura de `StrengthSet` (≈25 ms en `/` con 720 series; crece con el historial).
4. **No merece la pena:** `/training/performance`, `/study/focus`, `/search` (los 45–50 ms de BD son picos sin atribuir, no se repiten) ni ninguna ruta pública (`/login` 8 ms).

Para repetir la medida tras el cambio del punto 1: misma orden de arriba; basta con comparar «Consultas SSR» de `/` y `/planning`.

## Tras Rendimiento B5 (20/10/2026)
Mismo método (`TTFB_QUERIES=1 npm run e2e:v24a`), mismo contenedor; ruido de ±15 ms.

| Ruta | Mediana antes → después (claro) | Consultas SSR antes → después |
|---|---|---|
| `/` | 89 → 102 ms | 89 → 95 |
| `/planning` | 76 → 67 ms | 44 → 48 |

**Sin mejora medible en estas rutas, y la causa del punto 1 estaba mal atribuida.** Con un contador temporal en `currentSession` (`e2e:v24b`): 110 llamadas → 92 ejecuciones de `auth()`; solo 18 renders llamaban dos veces (layout + página). Las 20–50 sentencias `User` por visita son **peticiones distintas** (el proxy y el prefetch RSC de los enlaces, cada uno con su comprobación de revocación), que `cache` no puede compartir. Quitar esas exigiría cambiar la revocación (no se ha tocado).
Panel del club (`club-panel.int.test.ts`): 80 → 15 operaciones con 5 atletas y 410 → 15 con 20.
