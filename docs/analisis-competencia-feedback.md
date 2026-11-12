# Análisis de competencia y feedback · base para v2.7+

> Documento de referencia, **no es el roadmap** (eso es el Bloque 4). Fecha de referencia: 03/11/2026, sobre v2.6.0.
> Solo documentación: no cambia código, esquema ni paquetes. Lo que entra en cada versión lo decide la usuaria.

**Confianza:** cada bloque lleva [Seguro] (comprobado en el repo), [Probable] (inferencia sólida) o [Suponiendo] (hueco rellenado sin prueba).

## Lo incómodo primero
- [Seguro] **No hay feedback de uso real en el repo**: ni encuestas, ni tickets, ni analítica de producto (la telemetría de `lib/log.ts` y «Estado» solo mide errores y latencia). La sección 2 sale de **fuentes indirectas** (comprobaciones de la usuaria anotadas en `docs/estado.md`, incidentes, listas «Falta»/«Sin probar» de cada bloque y `docs/auditoria-ui.md`). Es feedback de **una sola usuaria y de quien la desarrolla**, no de un grupo. Priorizar con él tiene sesgo de superviviente: lo que no se usa no deja rastro.
- [Probable] El benchmarking sale de conocimiento público y general de cada app (patrones conocidos, no cifras de mercado ni pruebas de usabilidad propias; sin *scraping*). Las apps cambian rápido: tratar cada fila como hipótesis de diseño, no como hecho del producto ajeno.
- [Seguro] El mayor riesgo de la siguiente etapa **no es de funciones**: es todo lo marcado «Sin probar» con IA real, imagen Docker real y servidor real (ver § 3.4). Añadir novedades encima de eso multiplica lo no validado.
- [Probable] Atlenza abarca tres dominios (entreno, estudio, finanzas) que en el mercado cubren apps especializadas. Su ventaja es la integración y la privacidad (autoalojada, salud cifrada fuera de la IA); su riesgo, la profundidad desigual: Finanzas y Estudio crecieron mucho en v2.5–v2.6 y Entreno lleva más tiempo sin novedades.

## 1. Benchmarking de utilidades y patrones UI/UX

### 1.1 Entrenamiento de fuerza y atletismo
| App (patrón) | Qué resuelve bien | Fricción que genera | Para Atlenza |
|---|---|---|---|
| Strong / Hevy (registro de fuerza) | Registro de serie en 1–2 toques; repetir la sesión anterior con los pesos precargados; temporizador de descanso que arranca solo al marcar la serie | Plantillas rígidas; poco contexto de por qué una carga (sin RIR/VBT de serie en el plan básico); lo social de Hevy añade ruido | Tomar: precarga desde la sesión anterior y descanso automático (comprobar contra `strength-logger`/`rest-timer`). Evitar: capa social |
| TrainingPeaks (planificación de resistencia) | Carga de entrenamiento (CTL/ATL/TSB), plan por semanas, comentarios entrenadora-atleta en la sesión | Curva de aprendizaje alta; métricas opacas para quien no es técnica; muchas funciones tras pago | Atlenza ya tiene PMC, comentarios y vínculo entrenadora. Tomar: explicar cada métrica en una línea donde se muestra |
| Garmin Connect / Strava (ecosistema de dispositivo) | Importación automática; resumen de recuperación «listo/no listo» fácil de leer | Dependencia del dispositivo; el resumen de recuperación es una caja negra; privacidad por defecto laxa | Tomar: un indicador de disposición simple y explicable (ya existe `refreshReadiness`). Decisión fija: Strava fuera de IA, entrenadora y `.ics` |
| JEFIT (biblioteca de ejercicios) | Biblioteca grande con vídeo y músculo trabajado | Interfaz cargada; anuncios; muchas pantallas para registrar | Atlenza tiene vídeo propio cifrado. Evitar: más pantallas por serie |

### 1.2 Técnicas de estudio y TDAH
| App (patrón) | Qué resuelve bien | Fricción que genera | Para Atlenza |
|---|---|---|---|
| Anki (repetición espaciada) | Algoritmo de repaso fiable; tarjetas propias; funciona sin red | Crear tarjetas cuesta; interfaz árida; el atasco de repasos pendientes desmotiva | Atlenza tiene flashcards y `dueCounts`. Tomar: tope diario de repasos y «guardar a flashcards» desde Resumir (hoy falta) |
| Quizlet (tarjetas y juegos) | Generar práctica a partir de un texto; modos de juego cortos | Contenido ajeno de calidad variable; funciones de IA tras pago | Modo Juego ya genera desde los apuntes con cita literal: mantener esa garantía como diferencial |
| Forest (foco) | Una sola acción («empezar») y recompensa visual inmediata | Gamificación que se agota; no conecta el foco con qué se estudió | Atlenza tiene Pomodoro (`/study/focus`) **y** micro-pasos: dos temporizadores. Tomar: un único temporizador que anote el tiempo |
| Tiimo (planificación visual para TDAH) | Rutina del día en bloques visuales con cuenta atrás; poca decisión por pantalla | Planificar ya es una tarea; si el plan falla, no se replanifica solo | Tomar: «ruta priorizada» de asignaturas → bloques del día (`StudyPlanBlock`, hoy sin enlazar) |
| Notion / Obsidian (apuntes) | Flexibilidad total; enlaces entre notas | La flexibilidad es parálisis para TDAH; sin estructura de examen | Evitar: editor libre. Atlenza gana con formato impuesto (`adhd-format`, `LIMITS`) |
| Duolingo (gamificación) | Rachas, vidas, niveles cortos, sesión de 3–5 min | La racha genera culpa y sesiones vacías para no perderla | Modo Juego ya tiene vidas, combo y estrellas. Evitar: rachas punitivas; si se añaden, con «día de descanso» |

### 1.3 Finanzas personales móviles
| App (patrón) | Qué resuelve bien | Fricción que genera | Para Atlenza |
|---|---|---|---|
| YNAB (presupuesto base cero) | Cada euro con un destino; método claro | Método exigente; abandono alto si no se sigue a diario | Atlenza usa presupuestos por categoría con versión por mes. No adoptar base cero: más carga diaria |
| Fintonic (agregador bancario) | Movimientos automáticos desde el banco | Exige credenciales/agregador externo; privacidad; categorización errónea | Fuera por diseño (autoalojada, sin agregadores). Tomar: reglas de categorización al importar extracto (ya hay reglas y extracto) |
| Spendee / Wallet (multi-cuenta) | Registro rápido; gráficas de reparto; cuentas compartidas | Sincronización y suscripción; demasiadas gráficas | Atlenza ya tiene barra de reparto y `AccountPicker`. Evitar: gráficas extra en portada |
| Monefy (registro en 1 toque) | Categoría con un toque desde la portada; mínimo texto | Poca profundidad (sin cuentas reales ni transferencias finas) | `QuickTransaction` va en esa línea. Tomar: atajos de categorías frecuentes |

### 1.4 Patrones transversales contrastados con Atlenza
| Patrón | Estado en Atlenza (v2.6) | Confianza |
|---|---|---|
| Registro en 1–2 toques desde la portada | Finanzas sí (`QuickTransaction`, `AccountPicker`); Entreno exige entrar en la sesión | [Probable] |
| Recordar la última elección | Cuenta (`localStorage`), tipo de movimiento; no verificado en ejercicios | [Seguro] / [Suponiendo] |
| Estado vacío que enseña qué hacer | Hecho en v2.5 B9 | [Seguro] |
| Offline | PWA con `/offline`; páginas privadas no se cachean (bien por privacidad, peor para registrar sin red) | [Seguro] |
| Progreso entre dispositivos | Modo Juego sincroniza (`QuestProgress`); autoevaluación, micro-pasos y caché del banco **solo por dispositivo** | [Seguro] |
| Avisos | Telegram + push; sin email (decisión fija) | [Seguro] |
| Explicar números (por qué esta carga/nota) | Prescripción con `basis` y citas; disposición y PMC sin explicación inline | [Probable] |
| Táctil ≥ 44 px a 390 px | Norma desde v2.3 con E2E | [Seguro] |

## 2. Registro de feedback de uso (fuentes indirectas)

### 2.1 Lo más valorado
| Aspecto | Evidencia | Confianza |
|---|---|---|
| Medidor de salto (cámara y marcas a mano) | Comprobado por la usuaria en iPhone (HEVC/.mov), anotado en `estado.md` § Cierre v2.4 | [Seguro] |
| Estudio orientado a TDAH (Resumir, Pasos, Modo Juego, paquete de tema) | Es donde se concentraron los bloques B12–B20 y v2.6 a petición de la usuaria | [Probable] |
| Finanzas a 390 px simplificadas | Cuatro bloques seguidos (B1–B4) para registrar y revisar en móvil | [Probable] |
| Privacidad estricta (salud cifrada, Strava aislado) | Reglas fijas en `CLAUDE.md` y tests de privacidad; decisión sostenida desde v2.2 | [Seguro] |

### 2.2 Carencias recurrentes
| Carencia | Dónde aparece | Confianza |
|---|---|---|
| No se puede **editar el resultado de la IA antes de guardar** | Falta en B12 y B14 | [Seguro] |
| Estado **solo por dispositivo** (autoevaluación, micro-pasos, caché del banco, última cuenta) | Falta en B13, B16, B18, B20 | [Seguro] |
| Estudio no se conecta con el plan del día (`StudyPlanBlock`) ni anota tiempo | Falta en B13, B15, B16 | [Seguro] |
| IA sin validar con modelo real (citas literales, distractores, límites del nivel gratuito) | «Sin probar» en B14, B16, B17, B20, v2.6 y el arreglo del paquete sin tokens | [Seguro] |
| Edición incompleta en Finanzas (transferencias, asientos partidos, archivar cuentas) | Falta en B2 y B4 | [Seguro] |
| Planificación: editar todas las semanas a la vez; el prompt de `/planning/ai` sin citas | Falta en v2.5 B2 | [Seguro] |
| Modo Juego: reiniciar partida, tutorial, Jefe con tiempo | Falta en B18–B20 (parte del examen final llegó en v2.6) | [Probable] |

### 2.3 Elementos prescindibles o candidatos a retirar
| Elemento | Motivo | Confianza |
|---|---|---|
| «Sugerir fotogramas» (`jump-detect.ts`/`jump-scan.ts`) | No funciona; umbrales sin calibrar; apagado por defecto. Decisión pendiente de la usuaria | [Seguro] |
| Dos temporizadores de estudio (Pomodoro `/study/focus` y micro-pasos) | Hacen casi lo mismo y solo uno anota tiempo | [Probable] |
| `prompt()` nativos en `goals.tsx`/`meal-shortcuts.tsx` | Únicos diálogos fuera de `confirmDialog` | [Seguro] |
| Banco mock de `quest-mock.ts` | Solo queda como respaldo de fallos antiguos y para tests | [Probable] |

### 2.4 A rellenar por la usuaria (plantilla, sin datos reales)
| Fecha | Área | Qué intentaba hacer | Qué pasó / qué faltó | Frecuencia (diaria/semanal/rara) | Dispositivo (móvil/escritorio) |
|---|---|---|---|---|---|
| AAAA-MM-DD | Entreno/Estudio/Finanzas | … | … | … | … |

Sin cifras de salud, notas, importes ni nombres. Con 2–3 semanas de registro, la matriz de § 3 debe reordenarse.

## 3. Matriz de oportunidades

Leyenda: **Impacto** A/M/B · **Esfuerzo** S (≤ 1 bloque pequeño) / M (1 bloque) / L (> 1 bloque) · **Mig.** = necesita migración aditiva.

### 3.1 Novedades funcionales
| ID | Oportunidad | Origen | Impacto | Esfuerzo | Mig. | Depende de | Confianza |
|---|---|---|---|---|---|---|---|
| N1 | Editar el resultado de Resumir/Informe antes de guardar | Feedback 2.2 | A | S | No | — | [Seguro] |
| N2 | Guardar a flashcards desde Resumir y paquete de tema | Benchmark Anki/Quizlet | A | M | No | N1 | [Probable] |
| N3 | Histórico de autoevaluación y micro-pasos en BD (entre dispositivos) | Feedback 2.2 | M | M | Sí | — | [Seguro] |
| N4 | Enlazar ruta priorizada con `StudyPlanBlock` y anotar tiempo como estudio | Feedback 2.2, Tiimo | A | M | Probable | O9 | [Probable] |
| N5 | Modo Juego: reiniciar partida y tutorial «Cómo se juega» | Feedback 2.2 | M | S | No | — | [Seguro] |
| N6 | Finanzas: editar transferencias/asientos partidos y archivar cuentas | Feedback 2.2 | M | M | No | C4 | [Seguro] |
| N7 | Planificación: editar todas las semanas a la vez; citas en el prompt de `/planning/ai` | Feedback 2.2 | M | M | No | — | [Seguro] |
| N8 | Entreno: precargar la carga de la **sesión anterior** y arrancar el descanso al marcar serie (hoy una serie nueva copia la anterior de la misma sesión; lo demás sin comprobar) | Benchmark Strong/Hevy | A | S | No | Comprobar código | [Suponiendo] |
| N9 | Explicación de una línea en disposición/PMC | Benchmark TrainingPeaks/Garmin | M | S | No | — | [Probable] |
| N10 | Atajos de categorías frecuentes en `QuickTransaction` | Benchmark Monefy | B | S | No | — | [Probable] |
| N11 | Sugerir fecha de examen desde `ClassSlot` EXAM | Falta B15 | B | S | No | — | [Seguro] |

### 3.2 Optimizaciones (contraste con el Plan de Optimización de `docs/estado.md`)
| Fase | ID | Estado tras v2.6 | Nota |
|---|---|---|---|
| 1 · backend alto | O1 embeddings con `unnest` | Hecho (B1) | — |
| 1 | O2 `hnsw.iterative_scan` | Hecho (B1) | Rama activa solo ejercitada en CI (pgvector ≥ 0.8) |
| 1 | O3 timeout del SDK de Gemini | **Pendiente** | Prioritario: el paquete de estudio hace llamadas largas en cola |
| 1 | O4 recalcular carga una vez + `refreshReadiness` en lote | Hecho (v2.7.0 B2) | Consultas medidas en `docs/estado.md`; Strava difiere ≤ 0,01 de la cadena antigua (redondeo) |
| 1 | O5 extracto bancario en lote | **Pendiente** | ~6 consultas por línea |
| 2 · portada | O6 `dueCounts` | Hecho (B1) | — |
| 2 | O7 `budgetsStatus` | Hecho (B1) | — |
| 2 | O8 objetivos/material/resumen diario | **Parcial** | Falta el resumen diario |
| 2 | O9 `/study` sin `router.refresh()` cada 3 s | **Parcial** | Pestañas diferidas hechas (B2); el sondeo cada 3 s sigue |
| 3 · índices | O10 `SessionComment(athleteId/authorId)` | **Pendiente** | Migración aditiva de la versión |
| 3 | O11 `SecurityEvent(createdAt)`, `NotificationLog(sentAt)` | **Pendiente** | Ídem |
| 3 | O12 `tsvector` + GIN | Hecho (B1) | — |
| 3 | O13 `pg_trgm` en `FoodProduct` | **Pendiente** | Requiere extensión: comprobar en producción |
| 3 | O14 resto de índices | **Pendiente** | Prioridad baja |
| 4 · menores | O15 cuenta atrás en hijo | Hecho (B2) | — |
| 4 | O16 `router.refresh()` (162 usos) | **Pendiente** | Hacer por zonas, no de golpe |
| 4 | O17 cola de PDF | **Pendiente** | Hoy un render a la vez |
| 4 | O18–O25 (cliente IA por petición, concurrencia de embeddings, muestreo en SQL, `flushMetrics`, sumas en JS, caché de prompts, cuota sin bloqueo) | **Pendiente** | Agrupar en un bloque si sobra tiempo |

**Recomendación** [Probable]: Fase 1 restante (O3, O4, O5) antes que cualquier novedad de IA (N2, N4), porque O3 protege justo lo que más se va a usar; Fase 3 (O10, O11, O13) en la **misma** migración de la versión que N3, para no abrir dos; O9 junto con N4 (misma pantalla). **Medir antes y después** como pide el plan: hoy todas las cifras salen de la forma de la consulta, no de tiempos.

### 3.3 Correcciones de errores
| ID | Fallo | Origen | Impacto | Esfuerzo | Confianza |
|---|---|---|---|---|---|
| C1 | «Sugerir fotogramas» no acierta despegue/aterrizaje | Usuaria (v2.4) | M | L (rehacer) o S (retirar) | [Seguro] |
| C2 | `v25d` intermitente en CI | PR #115 | B | S | [Seguro] |
| C3 | `v20b` calcula en UTC (riesgo como el de `v25c`) | `estado.md` | B | S | [Probable] |
| C4 | El servidor no rechaza apuntes en cuentas archivadas | Falta B4 | M (al activar archivar) | S | [Seguro] |
| C5 | `/settings` «This page couldn't load» sin causa reproducida | Histórico | B | ? | [Suponiendo] |
| C6 | Tema > 150 000 caracteres: se avisa pero no se trocea el resumen | v2.6 | M | M | [Seguro] |
| C7 | `?tab=` por enlace directo hidrata más tarde (posible E2E sensible) | B2 | B | S | [Probable] |

### 3.4 Auditoría y seguridad
| ID | Punto | Origen | Riesgo | Esfuerzo | Confianza |
|---|---|---|---|---|---|
| S1 | El texto libre de la IA puede citar la recuperación aunque se oculte el snapshot | Auditoría privacidad v2.5 | A | M | [Seguro] |
| S2 *(hecho en v2.11 B4-A)* | `sw.js`: `PRECACHE_PATH` casa también rutas como `/training/diary`; acotar si el diario es privado | v2.5 B4 | M | S | [Seguro] |
| S3 *(hecho en v2.11 B4-A)* | `passkey.verifyRegistration` solo probado en rechazos | v2.5 B7 | M | S | [Seguro] |
| S4 | Validación con Gemini real pendiente (revisar `log.warn` con `code` tras la primera generación) | v2.6 | M | S (revisión) | [Seguro] |
| S5 | Imagen Docker real con Chromium sin construir | B17, v2.6 | A (la ruta de PDF da 503) | S | [Seguro] |
| S6 | Scripts de `scripts/ops/` sin probar en el servidor real (copias, auditoría, aviso de `update.sh`) | Ops | A (copias no verificadas) | S (tiempo de la usuaria) | [Seguro] |
| S7 | Cuota de estudio: el `.env` del servidor con 200 MB sigue mandando | B14 | B | S | [Seguro] |
| S8 | `unpdf` pide Node ≥ 24 y se usa Node 22 | PR #112 | B (vigilar) | S | [Seguro] |
| S9 | Idempotencia de `v2_6_study_pack` solo probada sobre copia local | v2.6 | M | S | [Seguro] |
| S10 | Sin rotación de logs del host ni Sentry | v2.5 B8 | B | M | [Seguro] |

## 4. Qué necesita decidir la usuaria antes del Bloque 4
1. **Validar antes de crecer:** ¿se cierra primero S4–S6 y S9 (despliegue real de v2.6 y revisión de logs) antes de cualquier novedad? Recomendación: sí.
2. **C1:** rehacer «Sugerir fotogramas» o retirarlo. Recomendación: retirarlo de la UI y dejar el código apagado hasta tener vídeos de calibración.
3. **Foco de la v2.7:** Estudio (N1, N2, N4) o Entreno (N8, N9). Las carencias documentadas pesan más en Estudio; el benchmark señala Entreno como el área más quieta.
4. **Migración única de la versión:** juntar O10, O11, O13 con N3 si entra.
5. **Feedback:** rellenar § 2.4 durante 2–3 semanas para sustituir fuentes indirectas por uso real.
