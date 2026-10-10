# LifeOS — Manual del backend

Arquitectura, flujos de datos, matemáticas de carga y arquitectura RAG.
Para el despliegue, ver [`manual_docker_debian.md`](manual_docker_debian.md).

---

## 1. Arquitectura

```
Navegador (PWA, Next.js App Router)
  │  Server Components ──► servicios (src/lib/*) ──► Prisma ──► PostgreSQL 17 + pgvector
  │  Client Components ──► API REST (src/app/api/**/route.ts) ──► servicios
  │
  └─ proxy.ts (antes "middleware"): exige sesión en todas las páginas
```

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Páginas | `src/app/(app)/**/page.tsx` | Server Components: leen los servicios directamente, sin pasar por HTTP |
| Formularios | `src/components/**` | Client Components: escriben vía API y luego `router.refresh()` |
| API REST | `src/app/api/**/route.ts` | Validación con zod, autenticación y llamada al servicio |
| Servicios | `src/lib/{training,nutrition,finance,ai}/service.ts`, `rag.ts`, `coach.ts`… | Lógica de dominio con acceso a BD |
| Lógica pura | `tss.ts`, `strength.ts`, `pmc.ts`, `readiness.ts`, `ledger.ts`, `chunking.ts`, `sm2.ts`, `openfoodfacts.ts` | Sin BD ni red, con tests unitarios (`npm test`) |
| Datos | `prisma/schema.prisma`, `prisma/migrations/` | 37 modelos; la migración inicial incluye SQL manual (HNSW y trigger contable) |

### Convenciones transversales

- **Errores.** Todos los handlers pasan por `route()` (`src/lib/api.ts`), que traduce cada tipo de error a un código HTTP:

  | Error | Respuesta |
  |---|---|
  | `ZodError` | 400 con `details[]` |
  | `ApiError` | su propio código |
  | Prisma `P2002` | 409 |
  | Prisma `P2025` | 404 |
  | Prisma `P2003` | 400 |
  | Cualquier otro | 500 (se registra en el log) |
- **Fechas.** Las columnas `@db.Date` se manejan como medianoche UTC (`src/lib/dates.ts`). "Hoy" se calcula en `Europe/Madrid`.
- **Dinero.** Siempre en céntimos de EUR (`Int`), nunca en coma flotante. `toCents("12,50") = 1250`.
- **Unidades.** Distancia en metros, tiempo en segundos, carga en kg y peso de implementos en gramos.
- **Entorno.** `src/lib/env.ts` valida las variables. Gemini y OpenFoodFacts son opcionales: si faltan, sus endpoints devuelven 503 en vez de impedir el arranque.
- **Cliente Prisma perezoso** (`src/lib/prisma.ts`). Se crea en el primer uso, no al importar. Así `next build` funciona sin `DATABASE_URL`, que no debe estar en la imagen Docker.

---

## 2. Autenticación y permisos

- **Auth.js v5** (`src/auth.ts`) con proveedor de credenciales y sesiones **JWT** (Auth.js no persiste sesiones de credenciales).
- **Contraseñas** con `scrypt` nativo de Node (`N=2^15, r=8, p=1`) y sal aleatoria; se comparan con `timingSafeEqual` (`src/lib/auth/scrypt.ts`, compartido con el script `npm run user`). Si el email no existe se verifica contra un hash ficticio, para que el tiempo de respuesta no revele qué cuentas existen.
- **Registro cerrado por defecto** (`ALLOW_REGISTRATION=false`): `registrationOpen()` (`src/lib/auth/users.ts`) solo deja registrarse al primer usuario de una instalación vacía. El resto se crean con `npm run user -- create` (`prisma/scripts/user-admin.ts`).
- **Límites de intentos** (`src/lib/rate-limit.ts`, ventana deslizante en memoria):

  | Qué | Límite | Clave |
  |---|---|---|
  | Login | 10 / 15 min | IP (última entrada de `X-Forwarded-For`, la que añade el proxy) |
  | Login por cuenta | 5 fallos seguidos → bloqueo 15 min (`User.failedLogins`, `lockedUntil`) | cuenta |
  | Registro | 5 / h | IP |
  | Re-autenticación (cambiar contraseña/email, borrar cuenta) | 5 / 15 min | usuario |
  | IA: chat · subida · flashcards/coach | 60 · 10 · 10 / h | usuario |
  | Exportaciones | 5 / h | usuario |

  Al superarlos: 429 con `Retry-After` (API) o "Demasiados intentos" (login, mismo mensaje para IP y cuenta bloqueada).
- **Sesiones JWT de 7 días con revocación.** El token lleva `sv` (= `User.sessionVersion`). El callback `jwt` lo compara con la BD en cada petición: cambiar la contraseña o el email, "cerrar sesión en todos los dispositivos" o `npm run user -- reset-password` incrementan `sessionVersion` e invalidan todos los tokens emitidos. Un usuario borrado también pierde la sesión al instante.
- **Cabeceras** (`src/proxy.ts`, `src/lib/security/csp.ts`, `next.config.ts`): CSP con *nonce* por petición (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-Opener-Policy`. `style-src` permite `'unsafe-inline'` porque Recharts y sonner usan atributos `style` (un nonce no los cubre).
- **Roles:** `ATHLETE`, `COACH` y `ADMIN`.
- **`requireUser()`** (API) devuelve 401 en JSON. **`pageUser()`** (páginas) redirige a `/login`.
- **Vínculo coach → atleta** (`CoachAthlete`):
  1. El coach invita al atleta por email; el vínculo queda en `PENDING`.
  2. Solo el atleta puede aceptarlo (`ACTIVE`) y conceder `canPlan`.
  3. Cualquiera de los dos puede revocarlo.
  4. `resolveAthleteId(user, athleteId, mode)` (`src/lib/auth/session.ts`) aplica las reglas:

     | Caso | Resultado |
     |---|---|
     | Sin `athleteId` | El propio usuario |
     | `ADMIN` | Acceso a cualquier atleta |
     | `COACH` | Solo con vínculo `ACTIVE`; para escribir además necesita `canPlan` |
- **Privacidad.** Finanzas, nutrición y estudio **nunca** aceptan `athleteId`: son datos privados de cada usuario.
- **Derechos sobre los datos** (`src/lib/account/service.ts`):
  - **Exportar:** `GET /api/account/export` devuelve un JSON con todas las tablas del usuario (sin hash de contraseña ni rutas internas). `GET /api/export/training|finance` → CSV para Excel (`;`, coma decimal, BOM, fórmulas neutralizadas).
  - **Borrar:** `DELETE /api/account` con contraseña y `confirm: "ELIMINAR"`. Borra en orden por las FK `RESTRICT` (movimientos → suscripciones → sesiones → usuario) y elimina `UPLOAD_DIR/<userId>`. Los ejercicios propios que usen sesiones de otros atletas (planificadas por un coach) pasan al catálogo global para no romper datos ajenos.

---

## 3. Flujos de datos por módulo

### 3.1 Entrenamiento

```
POST /api/training/sessions
  └─ createTrainingSession()                       src/lib/training/service.ts
       ├─ umbrales vigentes en la fecha            thresholdsAt()
       ├─ derivados: ritmo, tonelaje, e1RM por serie, mejor marca técnica
       ├─ computeSessionTss()                      src/lib/training/tss.ts
       ├─ INSERT cabecera + detalle 1:1 (track | technical | strength) en una transacción
       ├─ detectPersonalRecords()                  marca técnica por prueba+implemento, 1RM por ejercicio
       └─ recomputeDailyLoads(desde la fecha)      PMC
```

- **Una sola cabecera.** `TrainingSession` guarda fecha, tipo, duración, RPE de sesión, `tss` y `tssMethod`. El detalle va en `TrackSession` / `TechnicalSession` / `StrengthSession`. CTL/ATL salen de una única serie, sin `UNION`.
- **Sesiones planificadas.** Con `status=PLANNED` no suman carga ni generan marcas personales.
- **Umbrales versionados.** `ThresholdHistory` guarda FCmáx, FC de reposo, LTHR, ritmo umbral y CSS, cada uno con `effectiveFrom`. Cada sesión usa los umbrales de su fecha, así que actualizar el LTHR no reescribe el histórico.
- **Al borrar una sesión** se borran sus marcas personales y se recalcula la PMC desde su fecha.
- **Editar** (`PATCH /api/training/sessions/[id]`, página `/training/[id]/edit`): mismo cuerpo que el POST. `updateTrainingSession()` sustituye la sesión **conservando el id** dentro de una transacción (borra sus marcas, la sesión y el detalle y los recrea), redetecta marcas y recalcula la PMC desde la fecha más antigua entre la original y la nueva. Desde la v1.4 las sesiones `MIXED` (fuerza + técnica + pista) también se crean y editan desde el formulario («Sesión mixta»).
- **Repetir la última sesión de fuerza:** `/training/new?repeat=strength` precarga ejercicios, series y pesos con fecha de hoy (`sessionToFormInitial()`, `src/lib/training/form-initial.ts`).
- **Recalcular TSS** (`POST /api/training/recompute`, botón en Ajustes): recalcula el TSS de las sesiones completadas con los umbrales vigentes en el día de cada una (respeta el TSS manual) y rehace la PMC.

### 3.1b Planificación importada (PDF «día a día»)

```
POST /api/planning/import (multipart: zip o PDF)          src/app/api/planning/import/route.ts
  └─ parsePlanUpload()                                      src/lib/planning/plan-import/files.ts
       ├─ pdfsFromZip()    fflate, solo .pdf, ≤ 40 entradas, ≤ 60 MB descomprimidos (anti zip bomb)
       ├─ pdfLines()       unpdf/pdf.js: cada trozo con x, y y tamaño de letra   extract.ts
       └─ parsePlanPdf()   máquina de estados sobre líneas (pura, con tests)      parse.ts
  ├─ sin ?commit=1 → previewPlanImport(): altas / cambios / sin cambios / retirados / ya hechos
  └─ con ?commit=1 → commitPlanImport(): una transacción por bloque             service.ts
       ├─ ciclos: MACRO «Temporada AAAA-AA» · MESO por bloque (fase deducida del nombre) · MICRO por semana activa
       ├─ PlanMeso (intro, semanas, anexos, versiones) + PlanDay (contenido estructurado por día)
       └─ materialize(): sesiones PLANNED solo de la versión activa + competiciones en CalendarEvent
```

- **Cómo lee el PDF.** Las columnas de las tablas se cortan por la x de la cabecera «Ejercicio | Series × reps | %RM / carga | RIR | Desc. | Cómo lo hago», no por espacios. Una fila nueva empieza cuando hay texto en la columna «Ejercicio» y el salto vertical supera ~12 pt; si no, es la continuación de la celda. Una tabla que sigue en la página siguiente (cabecera repetida) se une a la anterior, y la fila partida por el salto de página también. Cabecera y pie de página (bandas de 45 pt) se descartan. Desde «Anexo X» todo va a `annexes`.
- **Versiones.** El código del día dice la versión: `A·S1` (A), `A·S2-V` (A, subvariante V), `S2·A` o `S1·sáb` (día de competición), `C·D−5` (rama, 5 días antes de la competición). Las opciones elegibles son las «hojas» (`A-V`, `A-S`, `B`…); elegir `A-V` activa también los días `A`. Por defecto: `B` si el bloque tiene «VERSIÓN A/B», `N` (plan normal) si hay rama, si no la primera. Los días relativos (D−n) necesitan la fecha de la competición (`anchorDate`).
- **Por qué PlanDay y no sesiones ocultas.** Las versiones no activas no deben sumar en nutrición (día de entreno), en el coach IA ni en los listados. Solo la versión activa existe como `TrainingSession`; cambiar de versión crea y retira sesiones `PLANNED`.
- **Reimportar** (versión nueva del PDF): la clave `meso|variante|fecha|orden` es estable. Los días cambiados actualizan su sesión si sigue `PLANNED`; las sesiones hechas u omitidas nunca se tocan (siguen enlazadas al día para ver el plan). Los días que desaparecen retiran su sesión planificada.
- **`PlanDay.sessionId` sin clave foránea**, a propósito: editar una sesión la borra y la recrea con el mismo id dentro de una transacción.
- **Privacidad.** Los PDF no se guardan: se leen en memoria. El plan entra en la exportación de datos (`planning.importedPlan`) y se borra con la cuenta (cascada).

### 3.1c Del plan al entreno (v1.4)

- **Tabla de RM** (`OneRepMax`: `name`, `nameKey` normalizado, `kg`, `perHand`, `source` MANUAL|PLAN|TEST|APRE, `effectiveFrom`): la vigente es la última por `nameKey`. `rmsFromPlan()` lee el anexo «Mi tabla de RM» del plan importado (`parseAnnexRms`, `src/lib/training/rm.ts`).
- **%RM → kg:** `loadToKg()` solo convierte cargas que son %RM (`isRmLoad`: excluye «≥95 % de esfuerzo», «40 % de 88 %», velocidades) y redondea al `kgStep` de Mis reglas. `annotateKg()` añade `row.kg` a las filas del día al pintarlo (no se guarda: si cambia la RM, cambian los kg).
- **Enlace plan → catálogo:** por nombre normalizado; si no hay coincidencia, el usuario elige una vez y queda en `ExerciseAlias` (`key` → `exerciseId` o `rmKey`).
- **Registrar desde el plan:** `planToBlocks()` (`plan-to-form.ts`) convierte la tabla del día en bloques del formulario (series × reps, kg, rampas como calentamiento); lo que no se puede leer se avisa, no se inventa.
- **Serie de test:** Epley `kg × (1 + reps/30)`; `testDecision()` propone actualizar solo si cambia ≥ `rmTestThreshold`. **APRE** 3/6/10 (`apreAdjust`).
- **Cumplimiento:** `compliance()` (`src/lib/planning/compliance.ts`) por semana sobre los días que ya tocaban.

### 3.1d Motor de reglas: «Mis reglas» (v1.4)

```
rulesToday(userId, día)                                      src/lib/rules/rules-service.ts
  ├─ getPrefs()           AthleteProfile.prefs → readPrefs() (valores por defecto genéricos)   prefs.ts
  ├─ loadRuleInputs()     63 días de RecoveryMetrics (control rápido, peso, grasa, VFC),
  │                       sesiones técnicas de lanzamiento (intentos; competición sin intentos = 6; vídeo)
  │                       y sensaciones de las sesiones de los últimos 7 días
  └─ evaluateRules()      puro y con tests                                                    engine.ts
```

- **Semanas ISO** (lunes). Tope de lanzamientos = `throwCapRatio` × media de las 4 semanas anteriores, solo si al menos 3 de ellas tienen lanzamientos (si no, es una «vuelta a lanzar» y el tope no tiene base).
- **VFC:** media de la semana (≥ 3 mañanas) frente a la media de las semanas anteriores; aviso fuerte solo si además baja el salto o el squeeze supera el umbral, si no, nota informativa.
- **Peso y grasa:** medias semanales; dos semanas subiendo ≥ `weightGainWeekKg`, cambio ≥ `weightBlockKg` en ~4 semanas y mínimo personal opcional.
- **Vídeo contado:** % de lanzamientos revisados con el codo estirado / la cabeza estable, dos semanas seguidas por debajo de `videoMinPct`.
- Los avisos se muestran en Inicio, en la sesión planificada de hoy y en el día del plan de hoy. Son pautas de prudencia, no diagnósticos.

### 3.1e Enlaces públicos con token (v1.4)

`/api/calendar/ics/[token]` (calendario) y `/api/report/[token]` (informe para la entrenadora) no exigen sesión, a propósito:

- token de 32 bytes aleatorios (`src/lib/security/share-token.ts`); en la BD solo su SHA-256 (`CalendarFeed.tokenHash`, `SharedReport.tokenHash`);
- formato validado antes de consultar, 404 si no existe, caducó (informe: 7 días) o se revocó;
- límite por IP (`calendarFeed`, `sharedReport`: 60/hora);
- **contenido mínimo:** el .ics lleva títulos, fechas y lugar (sin «(versión suave)», que podría delatar síntomas); el informe, planificado/hecho, lanzamientos, marcas y controles deportivos. Nunca ciclo, peso, VFC, notas ni nutrición; molestias solo con `includeInjuries`;
- el informe es HTML sin JavaScript con `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`;
- `src/test/api-auth.test.ts` lista estas rutas y comprueba que limitan peticiones.

### 3.1f Novedades de la v1.5

**Salud de la mujer** (`src/lib/health/women.ts` puro, `women-service.ts`):
- `WomenHealth` (ajustes) y `HealthLog` (cribado, analítica, suelo pélvico, semana de descanso) guardan el contenido **cifrado** con `sealJson` (AES-256-GCM, `DATA_ENCRYPTION_KEY` o `TOTP_ENCRYPTION_KEY`); en claro solo la fecha del registro. El tipo de registro va dentro del cifrado.
- Disponibilidad energética = (kcal ingeridas − kcal del ejercicio) / kg MLG, media de los días con comida registrada en 7; kcal del ejercicio ≈ (MET − 1) × peso × horas con MET = 2 + 0,8·RPE (entre 3 y 11; se descuenta el gasto en reposo). Sin peso o sin % de grasa, o con < 4 días de comida, devuelve «sin datos» en vez de estimar.
- El cribado de RED-S son 8 preguntas orientativas inspiradas en los dominios del LEAF-Q (no el cuestionario validado). Las fases posparto siguen Goom 2019 (tiempo + síntomas + tests de carga e impacto).
- **Nunca** entra en los prompts (`ai/data-ai.ts`, `ai-plan`, coach semanal), ni en `/api/report/[token]`, el `.ics` o las rutas del coach (`resolveAthleteId` no da acceso a estas tablas). Lo cubren `women.int.test.ts` y `v15.int.test.ts`. Modo embarazo/posparto: `generateAiPlan` lo rechaza y `getDashboard` filtra los avisos de peso, grasa y lanzamientos.

**Carga y recuperación:**
- `training/load-metrics.ts`: monotonía y strain de Foster (media/DE de la carga sRPE diaria de 7 días; strain = carga semanal × monotonía);
- `recovery/wellness.ts`: índice tipo Hooper (4–20) y deuda de sueño;
- `recovery/return-protocol.ts`: fases con criterios; con un protocolo activo, `evaluateRules` cambia los avisos de carga por el de la fase;
- `recovery/hrv-import.ts`: CSV con mapeo guardado en prefs.
- Las condiciones (`weather.ts`) se piden a Open-Meteo con timeout de 5 s, solo con las coordenadas de la pista y fuera de la petición de guardado; `LIFEOS_NO_WEATHER=1` las desactiva (tests).

**Entreno:**
- `vbt.ts`: regresión lineal carga-velocidad → RM estimada a la velocidad mínima (`vbtMvt`);
- `plan-vs-done.ts`;
- `physical-tests.ts`;
- `move-service.ts` (mueve también el `PlanDay` enlazado y avisa con `throwMinHours`);
- `planning/manual-plan.ts` (plan `MANUAL` que se activa con el mismo `activateAiPlan`).

**IA:** `ai/data-ai.ts` construye un resumen numérico de entrenos (sin salud, ciclo, notas ni nombre) para «pregunta a tus datos»; `voiceToDraft` usa Gemini solo con consentimiento y clave y, si no, el parser local `voice-parse.ts`. Límite `aiChat`.

**Estudio** (`study/schedule.ts`, puro): clases semanales con validez y exámenes; `examClashes` marca sesiones planificadas el día del examen o la víspera; `studyWeek`; `habitStreak` (la racha de ayer sigue viva hasta que acaba hoy).

**Plataforma:**
- `finance/sport.ts → sportBalance`: ingresos frente a gastos deportivos por año, y la previsión del año en curso a partir del día 30.
- `training/equipment*.ts`: usos = lanzamientos de jabalina con ese `implementWeightG` desde la compra (una competición sin intentos cuenta 6), sesiones (clavos: técnica/pista/mixta; zapatillas: todas) + `extraUses`; desgaste = el mayor entre usos y meses; 80 % avisa, 100 % pide reponer.
- `training/comments-service.ts`: acceso con `resolveAthleteId(…, "SESSIONS")`; si escribe el coach, push al atleta; si responde el atleta, push a los coaches que ya comentaron y siguen con permiso. Límite `comment` (60/hora). Solo el autor borra.
- `admin/status.ts`: `select 1`, tamaño de la BD, `_prisma_migrations`, estados de `pgboss.job`, `statfs(UPLOAD_DIR)`, último `BackupRun` (lo inserta `deploy/backup/backup.sh` con `psql`) y la última pasada del planificador. Nunca lanza: lo que no puede leer sale como `null`.

**PATCH parciales:** zod 4 aplica los `.default()` también dentro de `.partial()`. `parsePatchBody` (`lib/api.ts`) y `pickPatch` (`rules/prefs.ts`) devuelven solo las claves enviadas; úsalos en todo PATCH con un esquema con valores por defecto.

### 3.1g Novedades de la v1.6

**Regla transversal: nada escribe en `PlanDay`, `PlanMeso` ni en las sesiones planificadas sin una acción explícita.** `planning/v16-plan.int.test.ts` comprueba que el plan queda idéntico tras pedir sugerencias de kg, afinamiento y recolocación.

**Mujeres** (`health/women-plus.ts` puro; cifrado con el patrón de la v1.5):
- `completedCycles` (21–45 días entre inicios); `learnedSymptomDays` = proporción de ciclos completos con síntomas en cada día del ciclo (hace falta `MIN_CYCLES = 3`; un día sin registro cuenta como «sin síntomas»). Sustituye a `symptomParts` en `predictedDays` y en la versión suave cuando hay datos.
- `cyclePerformance`: días con síntomas o regla registrados frente al resto (RPE, kg/RM, marca, readiness); media e IC 95 %; «clara» solo si los intervalos no se solapan.
- `boneScreen` y `ironWeek` sin dosis. Registro `BONE` dentro de `HealthLog` (cifrado).
- `health/health-report.ts`: `HealthReport` (hash del token, 7 días, revocable). `/api/shared/health/[token]` es pública, HTML sin JS con CSP estricta y límite por IP; descifra al servir. `MEDICAL` (ciclo, analíticas, cribados) o `PHYSIO` (molestias, vuelta, carga).
- `health/safety-service.ts`: `SafetyContact` (vínculo aceptado, patrón `CoachAthlete`) y `SafetyTrip` (nota y ubicación con `sealJson`). `runSafetyJob` corre cada 5 min en su propio temporizador y avisa una sola vez (`alertedAt`).

**Fuerza y plan:**
- `training/autoreg.ts → suggestKg`: 1RM del día = Epley con `reps + RIR` de la primera serie efectiva (o el perfil carga-velocidad desplazado a la serie de hoy); kg = `kgForReps(1RM, repsPlan + RIRplan)`, limitado a ±`autoregMaxPct` del kg planificado y redondeado a `kgStep` dentro del límite. Se guarda en `StrengthSet.suggestedKg` solo si se usa.
- `planning/taper.ts`: `taperSets` recorta series («3 × 5» −30 % → «2 × 5», nunca menos de 1); se guarda solo `PlanDay.taperPct` y `dayView` lo aplica al mostrar.
- `planning/reschedule.ts → rescheduleOptions`: hasta 3 días en el horizonte; descarta los que rompen `throwMinHours` y penaliza exámenes, días previstos con síntomas y días ocupados. Mueve con `move-service` solo al confirmar.
- `rules/daily-light.ts`: verde/ámbar/rojo con umbrales `light*` de prefs y la lista de motivos.
- `manual-plan.ts → saveWeekTemplate/applyWeekTemplate` (solo planes `MANUAL`), `training/seasons.ts`, `training/prehab.ts`, `training/zone-fatigue.ts`, `recovery/body-measures.ts`.

**Jabalina** (`training/javelin-insights.ts`, puro; con pocos datos lo dice):
- `cueStats`: media de las sesiones con cada clave frente a la media del mismo implemento.
- `implementEquivalence`: mediana de (mejor con un peso / mejor con el de referencia) en los meses con ambos.
- `conditionsEffect`: residuo = mejor de la sesión − media de las 5 anteriores con el mismo implemento, por viento y temperatura.
- `minimumStatus`: distancia con la mejor de la temporada y fecha estimada por la tendencia de 8 semanas.
- `competitionForecast`: mejor de entreno de las 3 semanas previas × la relación competición/entreno propia (≥ 2 competiciones), con margen.

**Salud y recuperación:** `recovery/apple-health.ts` lee `export.xml` por trozos en el navegador y solo envía totales diarios (sueño ≤ 16 h, FC en reposo media) a `/api/recovery/import/days`; la VFC de Apple (SDNN) se ignora. `recovery/health-admin.ts`: suplementos (nunca dice si algo está permitido) y citas; `runAppointmentReminders` avisa la tarde anterior.

**Cocina** (`nutrition/kitchen.ts`): `mealNow(minutos hasta la prueba)` elige el momento de `compMeals`; `shoppingFromFavorites` suma gramos por ingrediente y salta lo que ya está en la lista (una favorita con el nombre de una receta aporta sus ingredientes); `recipeMacros` por ingrediente y por ración.

**Estudio** (`study/exam-plan.ts`):
- `dayCapacity = studyDailyMin − clase/2 − studyTrainingCutMin` si hay sesión ese día.
- `planStudy` reparte por orden de examen (el más cercano primero, para que uno lejano no lo deje corto), bloque a bloque en el día más libre; la víspera de cada examen queda para ese examen. Lo que no cabe sale en `shortfall`.
- `generateExamPlan` borra solo los bloques pendientes desde hoy y descuenta los hechos.
- `tickStudyBlocks` se llama al guardar un pomodoro.
- `gradeAverage` pondera por créditos.
- `studyIcsEvents` expande clases y exámenes a 120 días con `madridToUtc` (horario de verano), solo con `icsStudy`.

**Finanzas** (`finance/trips.ts`): presupuesto por partidas en céntimos; gastado = suma de los gastos con `tripId` (dinero que sale de cuentas ASSET/LIABILITY, como el informe deportivo); `netCents = gastado − reembolsable`. Enlazar un gasto lo marca `sport` con la competición del viaje. `deadlineState` y `runDeadlineReminders` avisan desde `remindDays` antes, una vez por plazo y fecha.

**Plataforma:**
- `offline/outbox.ts` (IndexedDB) + `OutboxSync`: el formulario de sesión manda `clientId`; `createTrainingSession` busca el duplicado y, si dos envíos coinciden, captura el P2002 de `@@unique([userId, clientId])` y devuelve la existente.
- `account/restore.ts`: valida `lifeos-export/2`, exige cuenta vacía, recrea sesiones con `createTrainingSession` y vuelve a cifrar lo de salud con la clave del servidor.
- `coach/compare.ts`: carga 7 días, cumplimiento 14 y mejor marca 30, cada dato solo con su permiso.

### 3.1h Novedades de la v1.7

**Reglas transversales:**
- La rutina del cuestionario se guarda como **borrador** (`saveDraftPlan` con `source: "ROUTINE"`, códigos RT1, RT2…) y solo se activa con `activateAiPlan`.
- Todo lo de salud nuevo se cifra con `sealJson` o `sealBytes` (`security/data-key.ts`, `security/secret-box.ts`) y pasa por `ensureHealthConsent`.
- Nada de ello llega a `ai/*`, al coach ni a los enlaces compartidos.

**Seguridad:**
- `auth/scrypt.ts`:
  - Argon2id (`@node-rs/argon2`, m = 19 MiB, t = 2);
  - `verifyPassword` acepta `$argon2` y scrypt antiguo;
  - `needsRehash` hace que `auth.ts` vuelva a guardar el hash al acertar.
- `auth/passkey.ts`:
  - WebAuthn con `@simplewebauthn/server` 13;
  - retos de un solo uso en `WebAuthnChallenge` (5 min);
  - segundo proveedor Credentials `passkey` con su propio límite por IP;
  - eventos `PASSKEY_*`.
- `security/audit-chain.ts`:
  - `hash = HMAC(HKDF(AUTH_SECRET), prevHash | evento)`;
  - `recordEvent` encadena dentro de una transacción con `pg_advisory_xact_lock`;
  - `auditIntegrity` recorre la cadena;
  - `ALERTS` envía un push en los eventos sensibles.
- Rotación de claves:
  - `openAny` prueba la clave actual y la `*_PREVIOUS`;
  - `security/rotate.ts → reencryptAll` recifra filas (`CycleProfile`, `CycleLog`, `WomenHealth`, `HealthLog`, `WellbeingLog`, `SafetyTrip`, 2FA) y ficheros (fotos y justificantes);
  - es idempotente y va por lotes.
- `files/sealed-files.ts`:
  - ficheros por usuario en `UPLOAD_DIR/<usuario>/…` como `iv(12) | tag(16) | cifrado`, con modo 600;
  - en la BD solo la ruta relativa, con `userFile` protegido contra `..`;
  - `sniffFile` comprueba la firma real (JPEG, PNG, WebP, PDF);
  - borrar la cuenta borra la carpeta, y `purgeUser` hace lo mismo sin contraseña (demos).

**Privacidad:**
- `privacy/service.ts`:
  - `Consent` (propósito, versión y concedido o retirado, como historial);
  - `PrivacyRequest`;
  - `User.processingRestrictedAt`.
- `assertNotRestricted` corta:
  - `ai/guard.ts`;
  - `resolveAthleteId` (coach);
  - la creación de enlaces;
  - el servido de `.ics`, informes e informes de salud.
- `privacy/retention.ts`:
  - días por defecto, sobrescribibles con `RETENTION_*_DAYS`;
  - `pruneAuditJob` borra según ellos, y también las demo caducadas.
- `privacy/legal.ts`: páginas `/legal/*` desde `LEGAL_*` (en `PUBLIC_PATHS` del proxy).

**Rutinas** (`routine/`, puro salvo `service.ts`):
- `buildProfile`: nivel y arquetipo, bandas por test con cortes ajustados por edad y sexo, y `blocked` si hay PAR-Q.
- `project(key, base, nivel, días, semanas)`:
  - `base · (1 ± g·k·(1 − e^(−t/τ)))`, con `g = GAIN[nivel] · TEST_GAIN[test] · frequencyFactor(días)`;
  - `k` = 1 para la línea esperada, 0,55 y 1,35 para la franja;
  - `τ` = 10, 16 o 22 semanas;
  - tope de mejora por test.
- `generateRoutine` produce un `AiPlan` válido para `validateAiPlan`: bloques de 3 semanas + descarga, respetando material, zonas y «evitar».

**Entreno y competición** (`training/competition-tools.ts`, puro):
- `throwsByImplementWeek`, `seasonRecords` + `ageCategory` (RFEA: edad cumplida en el año);
- `attemptSchedule` (tras la 3.ª ronda se supone que pasas, a mitad de la mejora);
- `combinedWarmups`, `compareSessions`;
- `parseIcsEvents` (RFC 5545, líneas plegadas), `parseCompetitionCsv` y `newCompetitions` (sin duplicar por fecha y nombre).

**Salud:**
- `recovery/wellbeing.ts`:
  - `hoursInBed`;
  - `caffeineAtBed` (vida media 5 h);
  - `sleepTips`;
  - `moodTrend` (7 días frente a las 3 semanas previas; aviso con la línea 024);
  - `quickDashScore` (media − 1) × 25 con ≥ 10 respuestas;
  - `achillesScore` (adaptación, 0–100);
  - `mobilityFor` (umbral `lightZoneAmber`);
  - `breathingPhase`.
- `WellbeingLog.data` va cifrado. `InjuryPhoto` tiene FK a `Injury`: al borrar la molestia, `deleteInjury` borra los ficheros.
- `health/women.ts`:
  - `contraception`, `contraceptionSince` y `menopause` en los ajustes (cifrados);
  - registro `MENO` en `HealthLog`.
- `health/health-report.ts`: tipo `ANNUAL` (12 meses: entreno, molestias, recuperación, bienestar y, si procede, el cuerpo médico).

**Nutrición y estudio:**
- `nutrition/planning.ts`:
  - `shoppingFromPlan` (escala por `servings / recipe.servings` y reutiliza `shoppingFromFavorites`);
  - `planDayMacros`;
  - `sweatRate` (`(pre − post + bebido − orina) / h`; litros por hora para no pasar del 2 % del peso);
  - `supplementWeek` (`Supplement.days`, 1 = lunes; `SupplementLog` único por día).
- `study/coursework.ts`:
  - `parseCardLines` (las tarjetas a mano usan el mismo `Flashcard` y SM-2);
  - `assignmentAlert`, `subjectAverages`;
  - `focusBySlot` (inicio = `createdAt − minutos`, en hora de Madrid).

**Finanzas:**
- `finance/season.ts`:
  - `seasonForecast` = máx(lineal con ≥ 30 días, gastado + competiciones pendientes × coste medio);
  - `priceAlerts`: cargos de 60 días por `subscriptionId` o por nombre normalizado (sin tildes) que superan el importe guardado.
- `SubscriptionPriceChange` se registra al editar el importe (`PATCH /api/finance/subscriptions/[id]`).
- `Receipt` (máx. 5 por movimiento, 5 MB) se borra con el movimiento.

**Plataforma:**
- `offline/outbox.ts → sendOrQueue`: agua (`POST`), hábitos (con `done` fijo: `toggleHabit(…, done)` es idempotente) y comidas.
- Con un envío en cola no se llama a `router.refresh()`: sin red recargaría la página.
- `/glance`: una consulta pequeña por bloque, sin gráficas.
- `demo/audiences.ts`: series sintéticas con PRNG de semilla (mulberry32).
- `demo/service.ts`:
  - crea el usuario con `demoAudience` y `demoExpiresAt`, en el dominio reservado `.invalid`;
  - inserta sesiones, recuperación y agua, y recalcula con `recomputeSessionsTss` (TSS, PMC y readiness);
  - crea la rutina del cuestionario;
  - como mucho 10 demo a la vez.

**Operación:**
- `prisma.ts`: pool `DB_POOL_MAX` (5) e inactividad de 30 s.
- `next.config.ts`: `outputFileTracingExcludes` y `turbopackIgnore` en las rutas de `UPLOAD_DIR`, para que el standalone no copie el proyecto.
- `docker-compose.yml`: límites de memoria y CPU, ajustes de Postgres por `command`, y `web` de solo lectura sin capacidades.
- `update.sh`:
  - build antes de migrar;
  - `dc up -d db` si cambió su configuración;
  - limpieza de huérfanos y reintento;
  - actualización del servicio de copias.

### 3.2 Recuperación

```
POST /api/recovery  (upsert por fecha)
  └─ upsertRecovery() → ensureLoadsUpToDate() → refreshReadiness(fecha)
       ├─ línea base: 60 días previos de VFC y FC de reposo
       ├─ TSB del día (DailyLoad)
       └─ computeReadiness() → readinessScore + readinessParts (desglose auditable)
```

### 3.3 Nutrición (OpenFoodFacts)

- **Búsqueda:** `GET /api/nutrition/search?q=hacendado yogur` llama a `https://es.openfoodfacts.org/cgi/search.pl` y guarda los productos con código de barras en `FoodProduct`.
- **Código de barras:** `GET /api/nutrition/products/{ean}` consulta `/api/v2/product/{ean}`.
  - Caché local de 30 días.
  - Si OFF falla, se devuelve el dato en caché aunque esté caducado.
- **Errores de OFF:**

  | Respuesta de OFF | Resultado |
  |---|---|
  | 404 | 404 tipado |
  | 429 | Aviso de límite de peticiones |
  | Timeout de 8 s | 502 |
  | En la búsqueda, cualquier fallo | Se cae a una búsqueda en la caché local (`source: "cache"` + `warning`) |
- **User-Agent identificable:** obligatorio para OFF (`OFF_USER_AGENT`).
- **Límites de OFF:** ~10 búsquedas/min y ~100 productos/min por IP. La caché amortigua ambos.
- **Diario (`Macros`).** Cada fila guarda una **copia** de kcal y macros calculada en el momento del registro: `macro = valor_por_100g × gramos / 100`. Si OFF corrige el producto después, el histórico no cambia.
- **Objetivo del día (`NutritionGoal`, versionado).** En días con sesión se multiplica por `trainingDayKcalFactor`; el extra se asigna a hidratos (`(kcal × (factor−1)) / 4` g).

### 3.4 Finanzas: partida doble

- **Modelo:** `FinancialAccount` (`ASSET`, `LIABILITY`, `INCOME`, `EXPENSE`, `EQUITY`) + `FinancialTransaction` (cabecera) + `Posting` (líneas).
- **Signo:** `+` es débito y `−` es crédito. **Invariante: Σ `amountCents` = 0 en cada transacción.**
- **Ejemplos de asientos:**

  | Operación | Líneas |
  |---|---|
  | Gasto de 12,50 € | `Gastos +1250` / `Banco −1250` |
  | Nómina | `Banco +150000` / `Ingresos −150000` |
  | Transferencia | `Ahorro +X` / `Corriente −X` |
  | Saldo inicial | `Cuenta +X` / `Saldo inicial (EQUITY) −X` |
- **Doble garantía del invariante:**
  1. `assertBalanced()` en el servicio, que da un 400 legible.
  2. `CONSTRAINT TRIGGER posting_balanced`, `DEFERRABLE INITIALLY DEFERRED`: se comprueba en el `COMMIT`, así que ni un acceso SQL directo puede dejar un asiento descuadrado.
- **Saldo de una cuenta:** Σ de sus líneas.
- **Flujo de caja mensual:** ingresos = −Σ(INCOME) y gastos = Σ(EXPENSE), agrupados por mes con `date_trunc`.
- **Presupuestos:** gasto del periodo actual (semanal ISO, mensual, trimestral o anual) sumando la categoría y sus subcategorías.

  | Gasto respecto al presupuesto | Estado |
  |---|---|
  | `pct ≥ alertThresholdPct` | `WARNING` |
  | `pct ≥ 100` | `EXCEEDED` |
- **Suscripciones `autoPost`:** `POST /api/finance/subscriptions/run` contabiliza cada cobro vencido (≤ hoy) y avanza `nextChargeDate`.
  - Es idempotente.
  - Conserva el día ancla: un cobro el día 31 pasa a 28/29 en febrero y vuelve al 31 en marzo.

---

## 4. Matemáticas de carga

Convención TrainingPeaks: **una hora exactamente en umbral = 100 TSS**. Todo está en `src/lib/training/` y es puro y testeado.

### 4.1 Cardio por frecuencia cardíaca: hrTSS

TRIMP de Banister, con reserva de FC `HRr = (FCmedia − FCreposo) / (FCmáx − FCreposo)`:

```
TRIMP = minutos × HRr × a × e^(b × HRr)        hombres: a=0.64, b=1.92 · mujeres: a=0.86, b=1.67
hrTSS = TRIMP(sesión) / TRIMP(60 min a LTHR) × 100
```

Necesita FCmáx, FC de reposo y LTHR, con `FCreposo < LTHR ≤ FCmáx`; si no, devuelve `null` y se prueba el siguiente método.

### 4.2 Cardio por ritmo: rTSS y swim TSS

```
IF_carrera  = ritmo_umbral / ritmo_medio        (s/km: menor = más rápido)
rTSS        = horas × IF² × 100
IF_natación = CSS / ritmo_medio_100m
sTSS_nat    = horas × IF³ × 100                 (el arrastre crece con el cubo de la velocidad)
```

### 4.3 Session-RPE (Foster)

Lineal, como está validado (Foster 2001), y reescalado a TSS:

```
carga_Foster = RPE (CR-10) × minutos
TSS_sRPE     = carga_Foster / (7 × 60) × 100       → 60 min a RPE 7 = 100
```

> Nota de diseño: un primer prototipo elevaba el RPE al cuadrado. Con datos reales sobrevaloraba las sesiones técnicas largas con mucho descanso (90 min de jabalina a RPE 8 daban 196 TSS), así que se volvió a la forma lineal validada.

### 4.4 Fuerza: series duras

No hay un sTSS estándar para fuerza. Se usa el recuento de series cercanas al fallo ponderado por esfuerzo:

```
esfuerzo  = RPE/10   (o (10 − RIR)/10; si no hay ninguno se asume RPE 7,5)
peso_serie = (esfuerzo / 0,8)²          RPE 8 → 1 · RPE 10 → 1,56 · RPE 6 → 0,56
TSS_fuerza = Σ peso_serie × 5           (~20 series duras ≈ 100 TSS; calentamiento excluido)
tonelaje   = Σ reps × (peso + factor_peso_corporal × peso_corporal)   (calentamiento excluido)
```

El tonelaje se guarda y se muestra, pero no se usa como TSS: compara mal entre ejercicios (100 kg de sentadilla no equivalen a 100 kg de curl).

**1RM estimado** (`estimateOneRm`). Las repeticiones hasta el fallo son `reps + RIR`; si no hay RIR, se usa `10 − RPE`:

| Repeticiones hasta el fallo | Fórmula |
|---|---|
| 1 | El propio peso levantado |
| 2–10 | Brzycki: `peso × 36 / (37 − r)` |
| 11–15 | Epley: `peso × (1 + r/30)` |
| > 15 | `null` (no fiable) |

En ejercicios con peso corporal (dominadas, fondos) el 1RM incluye ese peso.

### 4.5 Técnica: lanzamientos y saltos

Sin duración ni RPE: `TSS = intentos × 1,5 × (RPE/7)²`. Con duración y RPE se prefiere sRPE.

### 4.6 Selección automática del método

`computeSessionTss()` devuelve el método elegido y **todos los candidatos** (`tssCandidates`), para auditarlo:

```
MANUAL  >  HR_TSS  >  PACE_TSS  >  SRPE  >  TONNAGE (series duras) / TECHNICAL
```

### 4.7 PMC: CTL, ATL, TSB y ACWR

Modelo impulso-respuesta de Banister (`pmc.ts`), con recurrencia diaria. **Los días sin entreno cuentan como TSS 0**; si no, la fatiga nunca bajaría.

```
CTL_hoy = CTL_ayer + (TSS_hoy − CTL_ayer) / 42        Fitness
ATL_hoy = ATL_ayer + (TSS_hoy − ATL_ayer) / 7         Fatiga
TSB_hoy = CTL_ayer − ATL_ayer                          Forma con la que se llega a hoy
ACWR    = ATL / CTL                                    solo con ≥ 28 días de historia
rampa   = CTL_hoy − CTL_hace_7_días
```

- **Constantes 42 y 7:** configurables por atleta (`AthleteProfile`). Al cambiarlas se recalcula toda la serie.
- **`DailyLoad`:** tabla materializada que se puede recalcular en cualquier momento. `recomputeDailyLoads(desde)` usa como semilla el día anterior, reescribe desde esa fecha y refresca el readiness del rango.
- **Lectura actualizada:** `ensureLoadsUpToDate()` alarga la serie hasta hoy antes de cada lectura.
- **Umbral del ACWR:** antes de 28 días el CTL es casi 0 y el cociente se dispara (con datos reales llegó a 5,54 a los 3 días). Por eso es `null` hasta entonces.

### 4.8 Readiness (0–100)

Combina la forma (TSB) con marcadores de recuperación (`readiness.ts`):

| Componente | Peso | Cálculo de la puntuación (0–100) |
|---|---|---|
| VFC | 30 % | z = (ln rMSSD_hoy − media(ln base)) / max(sd, 0,05) → `75 + 30·z` (Plews: escala logarítmica y comparación individual) |
| TSB | 20 % | `70 + 2·TSB` (0 → 70; −30 → 10; +15 → 100) |
| Sueño | 20 % | horas: `100 − 20·déficit_vs_8h − 5·exceso_sobre_10h` (70 %) + calidad 1–5 (30 %) |
| FC en reposo | 10 % | z frente a línea base con sd mínima 1,5 → `75 − 30·z` |
| DOMS | 10 % | `100 − 10·DOMS` |
| Bienestar | 10 % | media de fatiga, estrés y ánimo (1–5; fatiga y estrés invertidos) |

Reglas:

- **Línea base:** los 60 días anteriores, con un mínimo de 5 mediciones. Sin línea base no hay componente de VFC ni de FC.
- **Componentes que faltan:** los pesos se **renormalizan**. Si hay menos del 30 % del peso total, el resultado es `null`.
- **Interpretación:**

  | Puntuación | Estado |
  |---|---|
  | ≥ 75 | `READY` |
  | 50–74 | `MODERATE` |
  | < 50 | `RECOVER` |
- **`readinessParts`:** guarda el desglose y el peso usado para poder explicar el número.

---

## 5. Astras AI (Gemini, `@google/genai`)

**Consentimiento.** Nada sale hacia Google sin permiso explícito del dueño de los datos: `User.aiConsentAt` (interruptor en *Ajustes → Privacidad e IA*, `PUT /api/account/ai-consent`). `assertAiAllowed(userId)` (`src/lib/ai/guard.ts`) se ejecuta al principio de la subida y del proceso de apuntes, `askStudyQuestion`, `generateFlashcards` y `generateWeeklyCoachReport`. En el coach cuenta el consentimiento del **atleta**, aunque el informe lo pida su entrenador.

**Tareas programadas** (`src/instrumentation.ts` → `src/lib/scheduler.ts`, `SCHEDULER_ENABLED`): al arrancar y cada hora, cobra las suscripciones vencidas de todos los usuarios, envía el resumen diario por push (desde las 7:00), genera el informe del coach de la semana anterior a quien tenga consentimiento, haya entrenado y aún no lo tenga, y borra la auditoría de más de 180 días. Ambas tareas son idempotentes: si el contenedor estuvo apagado, se ponen al día al arrancar. El cobro de suscripciones reserva la fecha con un `UPDATE … WHERE nextChargeDate = <leída>` para no cobrar dos veces si coincide con el botón manual.

### 5.1 RAG sobre apuntes

```
POST /api/ai/documents (multipart: file, subject?)            → 202 + documento en PENDING
  ├─ assertAiAllowed(): sin GEMINI_API_KEY → 503; sin consentimiento → 403 (antes de tocar disco)
  ├─ valida: PDF / TXT / MD, ≤ 15 MB, contenido real (PDF empieza por %PDF-, texto = UTF-8 sin NUL)
  │          y cuota por usuario (UPLOAD_QUOTA_MB, 200 MB por defecto)
  ├─ guarda el fichero en UPLOAD_DIR/<userId>/<docId>.<ext>
  └─ encola el trabajo (pg-boss, cola "ingest-document")

trabajador (src/lib/jobs/queue.ts, arrancado en instrumentation.ts) → processDocument()
  ├─ vuelve a comprobar el consentimiento (pudo retirarse entre subida y proceso)
  ├─ extrae texto: unpdf (pdf.js), por página
  ├─ trocea: chunkText() ≈1200 caracteres, 200 de solape,
  │          corte en párrafo > frase > palabra; conserva la página de origen
  ├─ embedContent(gemini-embedding-001, taskType=RETRIEVAL_DOCUMENT,
  │               outputDimensionality=768), lotes de 100
  ├─ normalización L2: Google solo normaliza la salida de 3072 dimensiones
  └─ borra fragmentos previos + INSERT DocumentChunk + UPDATE embedding = '[…]'::vector (idempotente)
```

- **Cola:** pg-boss guarda los trabajos en el esquema `pgboss` del mismo PostgreSQL (sin Redis). Un trabajo a la vez; 2 reintentos con espera creciente; caduca a los 15 min. Si falla, el documento queda en `FAILED` con el motivo y se puede reintentar (`POST /api/ai/documents/[id]/retry`). La UI refresca la lista cada 3 s mientras haya documentos en curso.

- **Consulta:**
  1. `embed(pregunta, RETRIEVAL_QUERY)`.
  2. KNN por **distancia coseno** sobre el índice **HNSW** (`vector_cosine_ops`, m=16, ef_construction=64), siempre **filtrado por `userId`**.
  3. Se queda con los 6 mejores y descarta los de similitud < 0,35.
- **Respuesta:** prompt de sistema "responde solo con los fragmentos, cita con [n]; si no está, dilo". Se envían los últimos 10 mensajes del hilo como contexto.
- **Persistencia:** `ChatMessage` con `citations` (fragmento, documento, página, score) y el consumo de tokens.
- **Por qué `vector(768)`:** cabe en HNSW (límite de 2000 dimensiones) y ocupa 4 veces menos que 3072. **Cambiar el modelo o la dimensión obliga a re-vectorizar** todos los documentos (`embedModel` queda registrado en cada documento).
- **Prisma y pgvector:**
  - Prisma no soporta el tipo `vector`: la columna es `Unsupported("vector(768)")` y se lee y escribe con `$queryRaw` / `$executeRaw`.
  - Prisma tampoco sabe declarar índices HNSW. Por eso `DocumentChunk` está marcada como **tabla externa** en `prisma.config.ts` (`experimental.externalTables`); sin eso, cada `migrate dev` generaría un `DROP INDEX`.
  - **Consecuencia:** los cambios de estructura de `DocumentChunk` se escriben a mano en SQL dentro de una migración.

### 5.2 Flashcards

- **Generación:** toma fragmentos repartidos por todo el documento (máximo ~40 000 caracteres) y llama a `generateJson()` con un esquema zod.
  - Gemini recibe el esquema como `responseJsonSchema` (decodificación restringida).
  - El servidor vuelve a **validar** la respuesta: si no cumple el contrato, 502.
- **Repaso:** **SM-2** (`sm2.ts`).

  | Nota | Efecto |
  |---|---|
  | < 3 | Reinicia la serie (intervalo de 1 día) y resta 0,2 al EF |
  | ≥ 3 | Intervalos de 1 → 6 → intervalo × EF |

  El EF (factor de facilidad) nunca baja de 1,3.

### 5.3 Coach de rendimiento semanal

- **Endpoints:**
  - `POST /api/ai/coach/weekly` (por defecto, la semana ISO anterior) hace un upsert de `CoachReport(userId, weekStart)`.
  - `GET …?preview=1` devuelve el snapshot sin llamar a Gemini.
- **Snapshot** (`buildWeeklySnapshot`). Es **lo único que ve el modelo**:
  - Carga total y por tipo (pista, técnica, fuerza): sesiones, TSS y minutos; además, el TSS de la semana anterior.
  - PMC: CTL al inicio y al final, ATL, TSB, ACWR y rampa.
  - Por sesión: lanzamientos (intentos, nulos, mejor marca, valoración media) y fuerza (tonelaje, series efectivas, series duras equivalentes).
  - Recuperación diaria y media semanal frente a la **línea base de 28 días** (VFC, sueño, FC de reposo, DOMS, readiness).
  - Ciclos activos y competiciones de los próximos 35 días.
- **Prompt de sistema** (`COACH_SYSTEM_PROMPT` en `src/lib/ai/coach.ts`). Incluye estos criterios, que el modelo debe aplicar con juicio:
  - Rampa de CTL > 5–8 puntos/semana o ACWR > 1,3–1,5 indican riesgo de sobrecarga.
  - TSB sostenido por debajo de −20 a −30 indica fatiga acumulada.
  - VFC por debajo de su línea base junto con FC de reposo por encima indica que conviene bajar la intensidad.
  - Sueño < 7 h: recomendar sueño antes que cambiar la carga.
  - Lanzadores y saltadores con fatiga: recortar primero los intentos de máxima intensidad o el peso del implemento (codo, hombro, lumbar, tendones).
  - Fuerza con readiness bajo: mantener la intensidad y recortar volumen.
  - Competición en ≤ 14 días: tapering (−40 a −60 % de volumen, intensidad mantenida).
  - Cada recomendación debe citar el dato que la justifica. Si faltan datos, va a `dataGaps`. Nunca diagnosticar lesiones.
- **Salida validada:** `riskLevel`, `summary`, `keyFindings[]`, `recommendations[{area, action, rationale, priority}]`, `nextWeek{targetTssMin, targetTssMax, maxHardSessions, notes}` y `dataGaps[]`.
- **Cron opcional:** para generarlo automáticamente cada lunes, programar un `POST` autenticado o una tarea que llame a `generateWeeklyCoachReport()`.

---

### 5.4 Crear planificación con IA (v1.4)

```
POST /api/ai-plan  {cuestionario}                              src/app/api/ai-plan/route.ts
  └─ generateAiPlan()                                          src/lib/ai-plan/service.ts
       ├─ PAR-Q: cualquier respuesta de seguridad marcada → 422 (no se genera)
       ├─ buildPlanPrompt()   solo el cuestionario: sin fechas, sin nombre, sin ciclo     prompt.ts
       ├─ generateJson(aiPlanSchema)  semanas tipo por fase (+ versión suave por sesión)   schema.ts
       ├─ validateAiPlan()    material del sitio, zonas excluidas, minutos +15 %, progresión ≤ 10 %,
       │                      calentamiento, descarga cada ≤ 4 semanas; si falla, 1 reintento con los errores
       └─ expandAiPlan()      fases → días con fecha (PlanMeso source=AI, status=DRAFT + PlanDay)  expand.ts
POST /api/ai-plan/[code]/activate    → MESO en el calendario + materialize() (sesiones PLANNED)
POST /api/ai-plan/[code]/feedback    → ajusta la semana siguiente con reglas locales (adjust.ts), sin IA
PATCH /api/planning/plan/day/[id]    → versión suave · cambiar de sitio (alternativas; si no, petición pequeña) · alternativa
```

- **Ciclo menstrual** (`CycleProfile`, `CycleLog`): JSON cifrado con AES-256-GCM (`sealJson`/`openJson`, clave `DATA_ENCRYPTION_KEY` o, si no está, `TOTP_ENCRYPTION_KEY`). La fase se calcula en local (`src/lib/health/cycle.ts`); con anticonceptivo hormonal no se estiman fases. La IA nunca recibe estos datos: genera una «versión suave» genérica de cada sesión y la app la propone según los síntomas. El coach no tiene ruta para leerlos.
- **Sin clave de Gemini** la sección lo explica; en la CI y los E2E, `LIFEOS_FAKE_AI=1` sustituye a Gemini por un generador determinista (`fake.ts`). **No usar en producción.**

## 6. Referencia de la API

Todas las rutas requieren sesión, salvo `/api/auth/*`, `/api/health` y las dos rutas públicas con token (§ 3.1e). Los cuerpos son JSON y se validan con zod. Las fechas usan el formato `YYYY-MM-DD`.

| Ruta | Métodos | Notas |
|---|---|---|
| `/api/auth/register` | POST | `{name, email, password≥10, role}`. 403 si el registro está cerrado |
| `/api/account` | DELETE | `{password, confirm: "ELIMINAR"}` → borra la cuenta y sus datos |
| `/api/account/password` | POST | `{currentPassword, newPassword}`; cierra todas las sesiones |
| `/api/account/email` | POST | `{currentPassword, email}`; cierra todas las sesiones |
| `/api/account/sessions` | DELETE | Cerrar sesión en todos los dispositivos |
| `/api/account/ai-consent` | GET, PUT | `{enabled}` |
| `/api/account/export` | GET | JSON con todos los datos del usuario |
| `/api/export/training` · `/api/export/finance` | GET | CSV |
| `/api/auth/[...nextauth]` | GET, POST | Auth.js (csrf, callback/credentials, session, signout) |
| `/api/profile` | GET, PATCH | Perfil del atleta; cambiar CTL/ATL recalcula la PMC |
| `/api/coach/links` | GET, POST | El coach invita por email |
| `/api/coach/links/[id]` | PATCH | El atleta acepta, concede `canPlan` o revoca |
| `/api/training/sessions` | GET, POST | Filtros `from`, `to`, `type`, `status`, `athleteId`; POST con unión discriminada por `type` |
| `/api/training/sessions/[id]` | GET, PATCH, DELETE | PATCH = mismo cuerpo que el POST; ambos recalculan marcas y PMC |
| `/api/training/recompute` | POST | `{from?, athleteId?}` → recalcula TSS y PMC con los umbrales de cada fecha |
| `/api/training/pmc` | GET | `?days=7…730` → `series[]` (un punto por día) + `current` |
| `/api/training/thresholds` | GET, POST | Umbrales con `effectiveFrom` |
| `/api/training/exercises` | GET, POST | Catálogo global + ejercicios propios; `?q=` |
| `/api/training/records` | GET | Marcas personales |
| `/api/recovery` | GET, POST | Upsert diario → `readinessScore` |
| `/api/planning/cycles` (`/[id]`) | GET, POST, DELETE | Macro, meso y micro jerárquicos; el hijo debe caber en las fechas del padre |
| `/api/planning/events` (`/[id]`) | GET, POST, DELETE | Competición (prioridad A/B/C), test de 1RM, toma de marca, taper, descarga, bloque de estudio, examen |
| `/api/tasks` (`/[id]`) | GET, POST, PATCH, DELETE | Prioridades LOW…URGENT |
| `/api/nutrition/search` | GET | `?q=` (OFF con respaldo en caché) |
| `/api/nutrition/products/[barcode]` | GET | EAN-8/13, UPC |
| `/api/nutrition/entries` (`/[id]`) | GET, POST, DELETE | GET `?date=` → entradas, totales y objetivo |
| `/api/nutrition/goals` | GET, POST | Versionado por `effectiveFrom` |
| `/api/finance/accounts` | GET, POST | Con saldo; `openingBalanceCents` opcional |
| `/api/finance/categories` | GET, POST | Jerárquicas |
| `/api/finance/transactions` (`/[id]`) | GET, POST, DELETE | `mode: "simple"` o `mode: "split"` (líneas libres que deben sumar 0) |
| `/api/finance/budgets` | GET, POST | GET devuelve el estado del periodo actual |
| `/api/finance/cashflow` | GET | `?months=1…36` |
| `/api/finance/spending` | GET | Gasto por categoría (por defecto, el mes actual) |
| `/api/finance/subscriptions` (`/run`) | GET, POST | `run` contabiliza los cobros vencidos (idempotente) |
| `/api/ai/documents` (`/[id]`, `/[id]/retry`) | GET, POST, DELETE, POST | Subida multipart → 202; el proceso sigue en segundo plano |
| `/api/account/2fa` | GET, POST, PUT, DELETE | Estado · `{password}` → QR · `{code}` → activa y devuelve 10 códigos de recuperación · `{password, code}` → desactiva |
| `/api/account/2fa/recovery-codes` | POST | `{password}` → 10 códigos nuevos (los anteriores dejan de valer) |
| `/api/account/activity` | GET | Últimos 50 eventos de seguridad |
| `/api/push` · `/api/push/subscription` · `/api/push/test` | GET · POST, DELETE · POST | Clave VAPID pública · alta/baja de un navegador · prueba |
| `/api/training/templates` (`/[id]`) | GET, POST, DELETE | `{name, payload}` (cuerpo de sesión sin fecha, validado como una sesión) |
| `/api/training/import` | POST | multipart `file` (.fit/.gpx/.tcx); `?save=1` crea la sesión. 409 si ya estaba importada |
| `/api/recovery/injuries` (`/[id]`) | GET, POST, PATCH, DELETE | Lesiones; el coach las lee con el permiso `RECOVERY` |
| `/api/nutrition/meals/copy` | POST | `{fromDate, toDate, mealType}` repetir una comida |
| `/api/nutrition/meal-templates` (`/[id]`, `/[id]/apply`) | GET, POST, DELETE, POST | Comidas favoritas |
| `/api/finance/import` (`/profiles`) | POST · GET, POST, DELETE | multipart `file`, `accountId`, `mapping`; `?commit=1` importa · formatos guardados |
| `/api/health` | GET | Healthcheck público (`SELECT 1`), sin datos |
| `/api/planning/import` | POST | multipart `files` (zip o PDF «día a día», ≤ 30 MB); vista previa, o importa con `?commit=1`. Límite: 20/hora |
| `/api/planning/plan` | GET | Bloques importados con sus versiones (`needsAnchor` si cuentan días hacia atrás) |
| `/api/planning/plan/variant` | POST | `{code, variant, anchorDate?}` → activa una versión: crea sus sesiones y retira las planificadas de la otra |
| `/api/planning/plan/[code]` | DELETE | Borra un bloque importado (sus sesiones planificadas y competiciones; lo hecho se queda) |
| `/api/ai/study/chat` | POST | `{question, threadId?, documentIds?}` |
| `/api/ai/study/threads` (`/[id]`) | GET, DELETE | Historial |
| `/api/ai/flashcards/generate` | POST | `{documentId, count 3–40}` |
| `/api/ai/flashcards/decks` · `/due` · `/[id]/review` | GET, GET, POST | Repaso SM-2 (`grade` 0–5) |
| `/api/ai/coach/weekly` | GET, POST | `?preview=1` devuelve solo el snapshot |
| `/api/ai-plan` | POST | Cuestionario → borrador (`aiGenerate`: 10/hora). 422 si la seguridad previa lo desaconseja |
| `/api/ai-plan/[code]/activate` · `/regenerate` · `/feedback` | POST | Activar el borrador · regenerar · `{week, rating EASY\|OK\|HARD, pain}` |
| `/api/planning/plan/day/[id]` | PATCH | `{mode}` versión suave · `{swap: lugar}` · `{alternative}` |
| `/api/health/cycle` (`/log`) | GET, PUT, DELETE · POST | Ajustes del ciclo (cifrados) y registro diario. Solo la dueña |
| `/api/training/rm` (`/[id]`, `/import`, `/test`) | GET, POST, DELETE | Tabla de RM, importar del anexo del plan, serie de test (Epley) |
| `/api/training/aliases` | POST | Enlazar un ejercicio del plan con el catálogo o la RM |
| `/api/settings/prefs` | GET, PATCH | «Mis reglas»: umbrales, redondeo, recordatorios, hidratos por día, checklist, objetivos de temporada |
| `/api/calendar/feed` | GET, POST, DELETE | Estado · crear enlace .ics (sustituye al anterior; la URL solo se devuelve aquí) · revocar |
| `/api/calendar/ics/[token]` | GET | **Público con token.** `text/calendar`, 60/hora por IP |
| `/api/reports` (`/[id]`) | GET, POST · DELETE | Enlaces del informe para la entrenadora `{from, to, includeInjuries}` (≤ 120 días, ≤ 10 activos) |
| `/api/report/[token]` | GET | **Público con token**, caduca a los 7 días. HTML sin JS |
| `/api/finance/transactions/[id]` | PATCH | `{sport, eventId?}` marcar como gasto o ingreso deportivo |
| `/api/health/women` (`/log`) | GET, PUT, DELETE · POST, DELETE | Salud de la mujer (cifrada). Solo la dueña; nunca el coach |
| `/api/nutrition/water` | GET, POST, DELETE | Agua del día y objetivo · anotar · deshacer la última |
| `/api/recovery/import` | POST | CSV de VFC y sueño con mapeo de columnas |
| `/api/recovery/injuries/[id]/protocol` | POST, PUT, DELETE | Vuelta por fases |
| `/api/training/sessions/[id]/move` | POST | `{date, copy?}` mover o duplicar una sesión planificada |
| `/api/training/sessions/[id]/comments` | GET, POST, DELETE | Hilo atleta–coach (`?athleteId=` para el coach con permiso SESSIONS) |
| `/api/training/tests` (`/[id]`) | GET, POST · DELETE | Tests físicos |
| `/api/training/equipment` (`/[id]`) | GET, POST · PATCH, DELETE | Material: `{addUses, retired, lifeUses, lifeMonths, notes}` |
| `/api/planning/manual` (`/day/[id]`, `/[code]/duplicate`) | POST · PUT · POST | Plan propio |
| `/api/ai/ask` · `/api/ai/voice` | POST | Pregunta a tus datos · texto dictado → borrador (límite `aiChat`) |
| `/api/study/classes` (`/[id]`) | GET, POST · DELETE | Horario y exámenes; GET incluye los choques de 14 días |
| `/api/study/sessions` (`/[id]`) | GET, POST · DELETE | Horas de estudio (`?week=` lunes) |
| `/api/habits` (`/[id]`, `/[id]/toggle`) | GET, POST · PATCH, DELETE · POST | Hábitos con racha; toggle `{date}` |
| `/api/admin/status` | GET | Estado del servidor. Solo `ADMIN` |
| `/api/health/reports` (`/[id]`) | GET, POST · DELETE | Enlaces para la médica o el fisio `{kind}`; DELETE revoca |
| `/api/shared/health/[token]` | GET | **Pública** con token: HTML sin JS, caduca y se revoca |
| `/api/safety` · `/api/safety/trip` · `/api/safety/contacts` (`/[id]`) | GET · POST, DELETE · POST · PATCH | «Entreno sola»: estado · salir/llegar · invitar · aceptar o quitar |
| `/api/planning/taper` | GET, POST | `?eventId=` propuesta · `{eventId, apply}` aplica o quita el afinamiento (solo `taperPct`) |
| `/api/training/sessions/[id]/reschedule` | GET | Huecos sugeridos (no mueve; mover usa la ruta de mover sesiones de la v1.5) |
| `/api/planning/manual/[code]/week-template` | POST, PUT | Guardar una semana tipo · aplicarla `{week, templateId}` (solo plan propio) |
| `/api/training/minimums` (`/[id]`) · `/api/training/prehab` (`/[id]`, `/[id]/toggle`) | GET, POST · DELETE / PATCH · POST | Mínimas · prehabilitación (marcar el día con `toggle`) |
| `/api/recovery/body` · `/supplements` · `/appointments` (`/[id]`) | GET, POST · DELETE | Antropometría, suplementos (también PATCH, p. ej. «comprobado hoy») y citas |
| `/api/recovery/import/days` | POST | Totales diarios (Apple Health, leído en el navegador) |
| `/api/account/restore` | POST | Exportación `lifeos-export/2` → cuenta vacía (409 si no lo está) |
| `/api/nutrition/shopping` (`/[id]`) | GET, POST, DELETE · PATCH | Lista de la compra; POST `{name}` o `{favorites}`; DELETE `?done=1` |
| `/api/nutrition/recipes` (`/[id]`, `/[id]/use`) | GET, POST · DELETE · POST | Recetas; `use` `{as:"entry",date,mealType,servings}` o `{as:"favorite"}` |
| `/api/study/exam-plan` (`/[id]`) | GET, POST · PATCH | Plan hasta el examen `{hours:{examId:h}}` · tachar `{done}` |
| `/api/study/grades` (`/[id]`) | GET, POST · PATCH, DELETE | Notas con media ponderada |
| `/api/finance/trips` (`/[id]`) | GET, POST · PATCH, DELETE | Viajes; PATCH `{reimbursed?, link?, unlink?}` |
| `/api/finance/deadlines` (`/[id]`) | GET, POST · PATCH, DELETE | Plazos con aviso |

---

## 7. Pruebas

```bash
npm test             # tests unitarios (motor de carga, contabilidad, OFF, troceado, SM-2, formatos,
                     #   limitador, scrypt, CSP, CSV, subidas, 2FA, cifrado, push RFC 8291, FIT/GPX/TCX,
                     #   CSV bancario y Norma 43, temporizador, agenda, lesiones, e1RM, plan en PDF con PDF sintéticos…)
                     # Con DATABASE_URL además los de integración (*.int.test.ts): ingesta con pg-boss y
                     #   pgvector, push contra la BD, importación de extractos sin duplicados y plan importado
                     #   (reimportar, respetar lo hecho, versiones, rama con fecha de competición)
npm run typecheck    # next typegen + tsc
npm run lint
npm run e2e          # recorrido de la UI en Chromium (app con ALLOW_REGISTRATION=true; BASE_URL)
npm run e2e:plan     # importar un plan sintético en 390 px: vista previa, versiones, plan del día y anexos
                     #   (PLAN_ZIP=ruta prueba tu propio zip en local; nunca lo subas al repositorio)
npm run e2e:v14      # v1.4 en 390 px (con LIFEOS_FAKE_AI=1): crear plan con IA, ciclo, RM y kg, registrar desde
                     #   el plan, control rápido y avisos, competición, .ics, semana, sensaciones, búsqueda,
                     #   sin conexión, hidratos, gastos deportivos e informe para la entrenadora
npm run e2e:v15      # v1.5 en 390 px: salud de la mujer (RED-S, analíticas, suelo pélvico, posparto, ciclo en
                     #   el plan), carga y bienestar, CSV de VFC, vuelta por fases, agua, tests físicos, plan
                     #   propio, imprimible, mover sesión, pregunta a tus datos, dictado, horario y exámenes,
                     #   pomodoro, hábitos, becas, material, comentario de la entrenadora y estado del servidor
npm run e2e:v16      # v1.6 en 390 px: mujeres (patrón, predicción, cribado óseo, enlace médico, hierro, entreno
                     #   sola), kg del día, afinamiento, recolocar, semáforo, semanas tipo, temporadas, prehab,
                     #   antropometría, jabalina, Apple Health, mapa del dolor, citas, sin conexión, restaurar,
                     #   panel multiatleta, cocina, plan de estudio, notas, .ics, viajes y plazos
npm run e2e:v17      # v1.7 en 390 px (usa `npm run user`: necesita DATABASE_URL): llave de acceso con
                     #   autenticador virtual, privacidad y limitación, rutina del cuestionario y proyección,
                     #   diario técnico, comparador, simulador, importar calendario, bienestar, fotos cifradas,
                     #   anticoncepción y menopausia, informe anual, plan de comidas, sudoración, suplementos,
                     #   tarjetas a mano, trabajos, presupuesto de temporada, justificante, subida de precio,
                     #   agua sin conexión, «De un vistazo» y cuenta demo (con una cuenta ADMIN)
npm run e2e:security # registro cerrado, límites por IP, bloqueo de cuenta, revocación de sesiones y caché,
                     #   2FA (erróneos, reutilizados, recuperación), auditoría, permisos del coach,
                     #   consentimiento IA, editar sesión, exportación y borrado de cuenta
                     #   (servidor recién arrancado con ALLOW_REGISTRATION=false y DATABASE_URL)
```

La CI (`.github/workflows/ci.yml`) ejecuta:
- `npm audit` (producción), lint, tipos, tests y build;
- Semgrep (reglas propias de `.semgrep.yml`, bloqueantes; desde PyPI);
- los tests de integración y todos los E2E contra PostgreSQL + pgvector;
- el **stack Docker real**:
  - healthcheck;
  - Trivy y SBOM;
  - copia cifrada con restauración comprobada;
  - `scripts/update.sh` con contenedor huérfano, límites de la BD y vuelta atrás forzada.

Las imágenes de Docker Hub pasan por el espejo `mirror.gcr.io`, para no chocar con el límite de descargas anónimas de los runners. Un test (`src/test/api-auth.test.ts`) falla si alguna ruta `/api` nueva no llama a `requireUser()`. Los E2E fallan ante cualquier error de consola, lo que incluye violaciones de la CSP.

**Sin probar contra los servicios reales:**

- **Gemini:** el entorno de desarrollo no tenía clave. Se verificó la degradación (503 y avisos en la UI), la extracción de PDF en el build standalone y el SQL de pgvector con vectores sintéticos.
- **OpenFoodFacts:** estaba bloqueado por el proxy. El cliente está cubierto con `fetch` simulado y se verificó el respaldo en caché.

---

## 8. Limitaciones conocidas y próximos pasos

- **Importar la planificación:** el lector está hecho para la maquetación de los PDF «día a día» del plan 2026-27 (cabeceras «M5 · S1 · LUNES 26/10 · …», tabla de 6 columnas). Si una versión futura cambia esa maquetación, la vista previa lo dirá (bloques no reconocidos, semanas sin días, días sin tabla) **antes** de importar. Los %RM se convierten a kg con la tabla de RM (v1.4).

- **Crear plan con IA:** probado con un Gemini simulado (la CI no tiene clave). La calidad real del plan depende del modelo; la validación del servidor impide material o zonas no permitidas y progresiones bruscas, pero no sustituye a un entrenador. Las semanas de VFC «marcadas» del plan no se leen del PDF: el aviso de VFC usa cualquier semana con ≥ 3 mañanas.
- **Recordatorios push:** se evalúan cada hora; con el contenedor apagado a esa hora, llegan en la siguiente pasada del día.

- **Importar del reloj:** los tests usan ficheros FIT generados con el codificador oficial de Garmin imitando a cada marca, y GPX/TCX escritos según cada formato; **no** ficheros exportados de relojes físicos. Si un reloj concreto escribe algo inesperado, la vista previa lo muestra antes de guardar.
- **Notificaciones en iPhone:** solo con la PWA instalada en la pantalla de inicio (iOS 16.4+). La vibración del temporizador no existe en Safari.
- **Commits de la v1.2 no del todo independientes:** comparten una migración y algún módulo (p. ej. la auditoría se usa en los permisos del coach); revertir uno puede exigir revertir otro.
- **PDFs escaneados sin capa de texto:** devuelven 422. Haría falta OCR.
- **Salud de la mujer:** el cribado de RED-S no es el LEAF-Q validado y la disponibilidad energética es una estimación (MET por RPE, % de grasa de báscula). Sirven para detectar señales, no para diagnosticar.
- **Pregunta a tus datos y dictado:** probados con Gemini simulado; la calidad real depende del modelo. El dictado depende de la API de voz del navegador (Chrome/Android sí; Firefox no).
- **Estado del servidor:** la «última copia» solo aparece si el servicio `backup` está activo y reconstruido desde la v1.5; la copia previa de `update.sh` no se registra.
- **v1.6 · Sin conexión:** solo las sesiones van a la bandeja; agua y hábitos todavía no. La bandeja vive en el navegador de ese móvil: si borras los datos del sitio antes de recuperar cobertura, se pierde.
- **v1.6 · Restaurar:** no entran finanzas ni viajes (asientos que dependen de cuentas), apuntes ni planes importados; los vínculos con coach y contactos de «entreno sola» hay que rehacerlos.
- **v1.6 · Entreno sola:** depende del push (sin SMS ni email) y de que el contenedor esté encendido; el aviso puede llegar hasta 5 min tarde. No sustituye a avisar a alguien de viva voz.
- **v1.6 · Predicciones (ciclo, previsión de marca, equivalencia entre implementos):** estadística sencilla sobre tus propios datos; con pocos datos lo dicen y no dan cifra, pero con pocos más siguen siendo orientativas.
- **Limitador en memoria:** vale para un único contenedor `web`. Con varias réplicas habría que moverlo a PostgreSQL o Redis; lo mismo para el planificador (se ejecutaría en cada réplica).
- **Editar una sesión** desde la UI reescribe solo los campos que muestra el formulario: los que se hubieran enviado por API (p. ej. `rir`, `tempo` o `velocityMs` de una serie) se pierden al guardar.
- **Marcas personales al editar:** se recalculan las de la sesión editada; las de sesiones posteriores que se compararon con ella no se reevalúan.
- **`Exercise @@unique([userId, name])`:** PostgreSQL trata los `NULL` como distintos, así que no impide duplicados en el catálogo global. El seed es idempotente con `findFirst`; si se crean ejercicios globales a mano, conviene un índice parcial único.
- **Calibraciones heurísticas:** `TSS_PER_HARD_SET = 5`, `TSS_PER_TECHNICAL_ATTEMPT = 1,5` y los pesos del readiness son puntos de partida razonables, no valores validados. Conviene ajustarlos a cada atleta con su propio histórico.
