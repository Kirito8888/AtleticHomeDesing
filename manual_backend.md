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
- **Editar** (`PATCH /api/training/sessions/[id]`, página `/training/[id]/edit`): mismo cuerpo que el POST. `updateTrainingSession()` sustituye la sesión **conservando el id** dentro de una transacción (borra sus marcas, la sesión y el detalle y los recrea), redetecta marcas y recalcula la PMC desde la fecha más antigua entre la original y la nueva. Las sesiones `MIXED` no tienen formulario y no se editan.
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

## 6. Referencia de la API

Todas las rutas requieren sesión, salvo `/api/auth/*`. Los cuerpos son JSON y se validan con zod. Las fechas usan el formato `YYYY-MM-DD`.

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
npm run e2e:security # registro cerrado, límites por IP, bloqueo de cuenta, revocación de sesiones y caché,
                     #   2FA (erróneos, reutilizados, recuperación), auditoría, permisos del coach,
                     #   consentimiento IA, editar sesión, exportación y borrado de cuenta
                     #   (servidor recién arrancado con ALLOW_REGISTRATION=false y DATABASE_URL)
```

La CI (`.github/workflows/ci.yml`) ejecuta `npm audit` (producción), lint, tipos, tests y build; Semgrep (reglas propias de `.semgrep.yml`, bloqueantes); tests de integración y ambos E2E contra PostgreSQL + pgvector; y el **stack Docker real**: healthcheck, copia cifrada con restauración comprobada y `scripts/update.sh` con vuelta atrás forzada. Un test (`src/test/api-auth.test.ts`) falla si alguna ruta `/api` nueva no llama a `requireUser()`. Los E2E fallan ante cualquier error de consola, lo que incluye violaciones de la CSP.

**Sin probar contra los servicios reales:**

- **Gemini:** el entorno de desarrollo no tenía clave. Se verificó la degradación (503 y avisos en la UI), la extracción de PDF en el build standalone y el SQL de pgvector con vectores sintéticos.
- **OpenFoodFacts:** estaba bloqueado por el proxy. El cliente está cubierto con `fetch` simulado y se verificó el respaldo en caché.

---

## 8. Limitaciones conocidas y próximos pasos

- **Importar la planificación:** el lector está hecho para la maquetación de los PDF «día a día» del plan 2026-27 (cabeceras «M5 · S1 · LUNES 26/10 · …», tabla de 6 columnas). Si una versión futura cambia esa maquetación, la vista previa lo dirá (bloques no reconocidos, semanas sin días, días sin tabla) **antes** de importar. Los %RM se muestran tal cual; aún no se convierten a kg.

- **Importar del reloj:** los tests usan ficheros FIT generados con el codificador oficial de Garmin imitando a cada marca, y GPX/TCX escritos según cada formato; **no** ficheros exportados de relojes físicos. Si un reloj concreto escribe algo inesperado, la vista previa lo muestra antes de guardar.
- **Notificaciones en iPhone:** solo con la PWA instalada en la pantalla de inicio (iOS 16.4+). La vibración del temporizador no existe en Safari.
- **Commits de la v1.2 no del todo independientes:** comparten una migración y algún módulo (p. ej. la auditoría se usa en los permisos del coach); revertir uno puede exigir revertir otro.
- **PDFs escaneados sin capa de texto:** devuelven 422. Haría falta OCR.
- **Limitador en memoria:** vale para un único contenedor `web`. Con varias réplicas habría que moverlo a PostgreSQL o Redis; lo mismo para el planificador (se ejecutaría en cada réplica).
- **Editar una sesión** desde la UI reescribe solo los campos que muestra el formulario: los que se hubieran enviado por API (p. ej. `rir`, `tempo` o `velocityMs` de una serie) se pierden al guardar.
- **Marcas personales al editar:** se recalculan las de la sesión editada; las de sesiones posteriores que se compararon con ella no se reevalúan.
- **`Exercise @@unique([userId, name])`:** PostgreSQL trata los `NULL` como distintos, así que no impide duplicados en el catálogo global. El seed es idempotente con `findFirst`; si se crean ejercicios globales a mano, conviene un índice parcial único.
- **Calibraciones heurísticas:** `TSS_PER_HARD_SET = 5`, `TSS_PER_TECHNICAL_ATTEMPT = 1,5` y los pesos del readiness son puntos de partida razonables, no valores validados. Conviene ajustarlos a cada atleta con su propio histórico.
