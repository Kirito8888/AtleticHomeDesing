# Roadmap v2.7+ · propuesta para autorizar

> **Propuesta, no compromiso.** Base: v2.6.0 (03/11/2026); **v2.7.0 publicada y desplegada el 07/11/2026**. Cruza `docs/analisis-competencia-feedback.md` (IDs N/O/C/S) con el Plan de Optimización de `docs/estado.md`.
> Los números de versión y qué entra en cada una los decide la usuaria; Claude no empieza nada sin autorización. Solo documentación: no cambia código, esquema ni paquetes.
> Confianza: [Seguro] comprobado en el repo · [Probable] inferencia sólida · [Suponiendo] hueco sin prueba.

## Lo incómodo primero
- [Seguro] **El orden pedido (1 rendimiento/IA, 2 UI, 3 índices) deja fuera el mayor riesgo documentado:** lo «Sin probar» con Gemini real, imagen Docker real y servidor real (S4–S6, S9). Rendimiento sobre una base sin validar optimiza a ciegas. Por eso hay un **Hito 0** antes de v2.7. Es trabajo de la usuaria (casi sin código) y puede hacerse en paralelo a v2.7.
- [Seguro] **O3 (timeout del SDK de Gemini) ya está hecho en el código:** `geminiClient` crea el SDK con `httpOptions.timeout` de 120 s (`src/lib/ai/provider.ts`, `TIMEOUT_MS`), y `estado.md` y el análisis lo dan por pendiente. Es un dato desfasado; se corrige en la documentación y v2.7 pierde ese bloque. Queda por comprobar que el timeout cubre también embeddings y que el reintento de `validatedCall` no multiplica la espera (120 s × 3 intentos).
- [Seguro] **No hay feedback de uso real** (§ 2.4 del análisis vacío) y las cifras de rendimiento salen de la forma de la consulta, no de tiempos. El orden de v2.8–v2.11 es hipótesis: se reordena con 2–3 semanas de registro.
- [Probable] Cinco versiones es mucho para una sola usuaria que además prueba y despliega. Realista: autorizar v2.7 y v2.8 y revisar el resto con uso real.

## Criterios y reglas de corte
1. **Estabilidad y validación** antes que novedades; **rendimiento/IA** (Fase 1) antes que UI; **índices** agrupados en **una** migración aditiva, en la versión que ya la necesita por datos (v2.9).
2. Cada bloque de rendimiento: **medir antes y después** (contar consultas como en `docs/ttfb-v2-4.md`) y anotar la cifra en `estado.md`.
3. Un bloque = una sesión (`docs/como-trabajar.md`). Máximo 4 bloques por versión. Cada bloque cierra con typecheck, lint, tests de lo tocado, su E2E, commit y push.
4. Migración: una por versión, regenerada con `regen-mig.sh`. **Si `main` se desplegó a mitad de versión, lo nuevo va en migración nueva; una desplegada no se edita** (incidente 02/11/2026).
5. Se mantienen las reglas fijas: salud cifrada y Strava fuera de la IA y de la entrenadora; nada escribe en el plan sin confirmar; repo público.
6. El cierre de cada versión (`e2e.sh all`, `test-migration.sh`, Semgrep, licencias, CHANGELOG, guía, manual «De vX a vY», PR) es una sesión aparte, no cuenta en los 4 bloques.

## Hito 0 · Validar v2.6 en real (puerta previa, sin versión)
Tiempo de la usuaria; solo genera parches si algo falla.

| ID | Qué | Cómo se da por hecho |
|---|---|---|
| S5 | Construir la imagen Docker con Chromium | La ruta del manual PDF responde 200, no 503 · **07/11: Chromium presente y imagen construida; falta solo la prueba manual con sesión** |
| S9 ✅ (07/11/2026) | Aplicar `v2_6_study_pack` en el servidor real | `migrate status` al día y `/study/modules/…` sin error (comprobación en `docs/migracion-v2-5-a-v2-6.md`) · tablas y migración confirmadas con `verify-hito-0.sh` |
| S4 (sustituido) | Generar un paquete de tema con Gemini real → **ahora, con la IA local** (`LOCAL_AI_ONLY=true`, hoy apagada) | Revisar los `log.warn` con `code` (`ai_empty`, motivo); anotar citas literales, distractores y límites del nivel gratuito (`STUDY_PACK_MIN_INTERVAL_MS=4000`) |
| S6 ✅ (07/11/2026) | Primer `--dry-run` de ops, `verify-backup.sh --restore-test`, `check-backups.sh` | Copia restaurada y registro en `BackupRun` · `check-backups.sh`: copias al día |
| S7 (pendiente) | Revisar `UPLOAD_QUOTA_MB` del `.env` del servidor | Valor que la usuaria quiere (200 manda sobre 5 120) |
| C1 (pendiente) | Decidir «Sugerir fotogramas» | Recomendado: retirar de la UI y dejar el código apagado |

## Parches v2.6.x opcionales (cada uno, un bloque pequeño, sin migración)
| Parche | Contenido | Pruebas |
|---|---|---|
| v2.6.1 | C2 endurecer la espera de `v25d`; C3 `v20b` con fecha de Madrid; C7 espera en E2E que entran por `?tab=` | `v25d`, `v20b`, `v25k`, `v25l`, `v25o` |
| v2.6.2 | C1 retirar «Sugerir fotogramas» de la UI (si la usuaria lo decide) | `salto` |

## Bloques de IA local (L1–L4 · propuesta; nacen de la IA local ya fusionada, PR #120)
Contexto: `docs/estado.md` § «IA local primero». La usuaria usa **solo su servidor de IA local** de momento. Sin migración; cada uno es un parche pequeño que se puede fusionar solo. Qué versión llevan lo decide la usuaria.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| L1 ✅ (05/11/2026) | **`LOCAL_AI_ONLY=true`**: `aiFor` nunca devuelve otro proveedor aunque haya claves guardadas; embeddings desactivados (búsqueda por texto); `providerLabel` y el texto «Privacidad e IA» de Ajustes dicen que los datos solo van al servidor propio; con el local apagado, error 503 claro | Con la variable y una clave de Gemini guardada, ninguna petición sale de la red local; Ajustes lo explica | `provider.test.ts`/`local.test.ts` ampliados; E2E de Ajustes → IA |
| L2 ✅ (05/11/2026) | **Paquete de tema con IA local:** revisar `expireInSeconds` (15 min) y `STUDY_PACK_MIN_INTERVAL_MS` con ~35 tok/s y la cola de uno en uno; tasa de fallos de JSON | Un tema real se genera completo o falla con aviso; tope documentado | `study-pack.int.test.ts`; E2E `v26pack` |
| L3 ✅ (05/11/2026) | **DOCX** (`mammoth`): subir apuntes `.docx` con validación de contenido y topes de descompresión como `pptx.ts` | Un `.docx` se procesa y se pregunta sobre él | `upload.test.ts`, `ingest.int.test.ts` |
| L4 ✅ (05/11/2026) | **Imágenes grandes:** redimensionar en servidor (`sharp`, ahora declarada en `package.json`) al pasar de 5 MB en lugar de rechazarlas | Una foto de 8 MB se envía al local reducida | `local.test.ts` |

Orden recomendado: **L1 → L2 → L4 → L3.** Sin L1, el aviso de privacidad es falso y Gemini puede volver a recibir datos.

## Pendientes sin versión asignada (detectados tras desplegar v2.7.0, 07/11/2026)
Los asigna la usuaria; ninguno cambia el esquema.

| Pendiente | Contenido | Terminado = |
|---|---|---|
| P1 · CSP `eval` | Evento «script-src bloqueó eval» en `/study`, `/recovery` y `/nutrition` (visto en Estado del servidor desde el 03/11, antes de v2.7.0). Encontrar qué lo dispara y quitarlo **sin relajar la CSP** | Sin nuevos eventos CSP en esas rutas y la función afectada (si la había) funciona |
| P2 · Cola | 3 trabajos fallidos (`failed 3 · completed 6`). Mirar el motivo en el panel de administración; [Suponiendo] IA local apagada | Motivo conocido; reintentados o descartados |
| P3 · Build fuera del servidor | El `next build` dentro del servidor se ahogó por memoria (otra carga del mismo servidor dejaba poca libre; presión de memoria alta, ~5 h sin acabar el tipado; `tsc` aislado tarda ~30 s). Construir en CI, publicar la imagen y que `scripts/update.sh` haga `pull` en vez de `build`; mientras tanto, `timeout` en el build y actualizar solo con memoria libre. La imagen no debe llevar secretos | Una actualización sin compilar en el servidor |

## v2.7.0 · IA y backend fiables (Fase 1)
- **Objetivo para la atleta:** que restaurar, importar de Strava, guardar la VFC o importar un extracto no se queden esperando, y que ninguna llamada de IA cuelgue la pantalla.
- **Alcance funcional:** ninguno nuevo; mismo comportamiento, más rápido y predecible. Una excepción de privacidad (B4).
- **Optimizaciones técnicas:** O18, O4, O5, comprobación de O3, S1.
- **BD:** **sin migración.**
- **Pruebas:** integración con contador de consultas (antes/después) + E2E de las zonas tocadas.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| B1 | **O3 (verificar)** timeout también en embeddings y tope de espera total con reintentos; **O18** un cliente de IA reutilizado en lugar de uno por petición | Peor caso de espera documentado y acotado; tests de `provider` con SDK simulado que no responde | `provider.test.ts`, `study-pack.int.test.ts`; E2E `v26pack` |
| B2 | **O4** recalcular la carga una vez (restaurar, Strava, VFC) y `refreshReadiness` en lote | Consultas por operación medidas antes/después; resultados idénticos | Integración nueva con contador; E2E `v110`, `v22a`, `v24a` |
| B3 | **O5** extracto bancario en lote (hoy ~6 consultas por línea) | Extracto de 200 líneas con consultas casi constantes; mismas categorías y duplicados | Integración nueva; E2E `v20d` o la de finanzas que cubra el extracto |
| B4 | **S1** el texto libre de la IA no cita la recuperación si el ámbito la oculta | Test que falla si aparece dato de recuperación con el ámbito cerrado | `scope-isolation.int.test.ts` ampliado; E2E `v25e`/`security` |

## v2.8.0 · Estudio sin fricción (UI/UX)
- **Objetivo para la atleta:** corregir lo que genera la IA antes de guardarlo, convertirlo en tarjetas y no perder el hilo en el Modo Juego.
- **Alcance funcional:** N1, N2, N5; O9 y el resumen diario (O8) para que `/study` no repinte cada 3 s.
- **BD:** **sin migración** (N2 usa `Flashcard`/mazos existentes; si al diseñarlo hace falta un campo, se mueve a v2.9 [Suponiendo]).
- **Pruebas:** unitarias de los puros afectados + E2E existentes.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| B1 | **N1** editar el resultado de Resumir y del Informe antes de guardar (el formato TDAH se vuelve a imponer al guardar) | Edito, guardo y el apunte lleva mi texto con los `LIMITS` | `adhd-format.test.ts`, `adhd-report.test.ts`; E2E `v25k` |
| B2 | **N2** guardar a flashcards desde Resumir y desde el paquete de tema, solo tras confirmar | Tarjetas creadas en un mazo elegido, sin duplicar | Integración nueva; E2E `v25k`, `v26pack` |
| B3 | **N5** reiniciar partida (con `confirmDialog`) y tutorial «Cómo se juega» | Reinicio borra local y servidor (`QuestProgress`); el tutorial se ve una vez | `quest.test.ts`, `quest-progress.int.test.ts`; E2E `quest` |
| B4 | **O9** endpoint de estado para el sondeo de `/study` + **O8** resumen diario sin consulta por elemento | Sin `router.refresh()` cada 3 s; consultas medidas | Integración con contador; E2E `v26pack`, `v25m` |

## v2.9.0 · Datos entre dispositivos e índices (la migración)
- **Objetivo para la atleta:** que autoevaluaciones y micro-pasos la sigan entre móvil y escritorio, y que el estudio cuente en su plan del día.
- **Alcance funcional:** N3, N4 (un solo temporizador que anota tiempo: absorbe el Pomodoro de `/study/focus` o lo enlaza).
- **Optimizaciones técnicas:** O10, O11, O13 (y O14 solo lo que salga de medir).
- **BD:** **migración aditiva única** `<AAAAMMDDhhmmss>_v2_9_features`: índices `SessionComment(athleteId/authorId)`, `SecurityEvent(createdAt)`, `NotificationLog(sentAt)`; `pg_trgm` + índice en `FoodProduct` **solo si** la extensión está disponible en producción (comprobarlo antes; si no, O13 queda fuera); tablas del histórico de N3; posible campo en `StudySession`/enlace a `StudyPlanBlock` para N4. Foto con `snapshot.sh` antes de cambiar el esquema; `test-migration.sh` al cierre.
- **Pruebas:** `test-migration.sh`, integración de los servicios nuevos, E2E de las zonas.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| B1 | Migración con **O10, O11** (+ O13 si procede) y `EXPLAIN` antes/después donde haya datos | Índices creados, consultas medidas, migración idempotente | `test-migration.sh`; integración `SessionComment`/`SecurityEvent` |
| B2 | **N3** histórico de autoevaluación y micro-pasos en BD (importa lo local una vez, sin borrarlo hasta confirmar) | Hago un test en el móvil y lo veo en el escritorio | Integración nueva; E2E `v25n`, `v25l` |
| B3 | **N4** ruta priorizada → bloques del día (`StudyPlanBlock`), siempre como borrador + aceptar | Acepto la ruta y aparecen bloques en el plan | Integración nueva; E2E `v25m` + nueva |
| B4 | Temporizador único que anota el tiempo como `StudySession` (retira el duplicado) | Una sesión de foco suma minutos al estudio | `micro-timer.test.ts`; E2E `v25l` |

## v2.10.0 · Entreno
- **Objetivo para la atleta:** registrar series con menos toques y entender por qué su carga y su disposición son las que son.
- **Alcance funcional:** N8, N9, N7. **Optimización técnica:** ninguna propia.
- **BD:** **sin migración.**
- **Pruebas:** unitarias + E2E de entreno/planificación.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| B1 | **N8** primero comprobar qué hace hoy `strength-logger`/`rest-timer` ([Suponiendo] que falta); luego precarga desde la sesión anterior y descanso automático | Abro una sesión y veo los pesos de la anterior; marcar serie arranca el descanso | Test del puro nuevo; E2E de fuerza (`v110` o nueva) |
| B2 | **N9** explicación de una línea en disposición y PMC | Cada métrica lleva su frase; sin salud cifrada nueva en pantallas ajenas | `health` tests; E2E `v25g` |
| B3 | **N7** editar todas las semanas a la vez + citas en el prompt de `/planning/ai` | Cambio una serie en todas las semanas con borrador y aceptar | `prescription` tests; E2E `v25b`, `v25c` |

## v2.11.0 · Finanzas y menores
- **Objetivo para la atleta:** corregir cualquier movimiento y archivar cuentas sin riesgo.
- **Alcance funcional:** N6, N10, N11. **Optimizaciones técnicas:** O17, O16 por zonas, O19–O25 restantes. Seguridad menor: S2, S3, S8.
- **BD:** **sin migración** salvo que archivar cuentas exija un campo nuevo (hoy `isArchived` existe; comprobar). C4 va con N6.

| Bloque | Contenido | Terminado = | Pruebas |
|---|---|---|---|
| B1 | **N6 + C4** editar transferencias/asientos partidos; el servidor rechaza apuntes en cuentas archivadas; UI para archivar | Edito una transferencia y los saldos cuadran; apuntar en archivada → 409 | `accounts.int.test.ts`, `history.int.test.ts`; E2E `v25h`, `v25i` |
| B2 | **N10** atajos de categorías + **N11** fecha de examen desde `ClassSlot` | Un toque para categorías frecuentes; sugerencia de fecha aceptable o ignorable | Tests nuevos; E2E `v25h`, `v25m` |
| B3 | **O17** cola de PDF + **O16** `router.refresh()` en las zonas más usadas (no los 162) | Dos PDF a la vez no se pisan; menos repintados medidos | `pdf-render.int.test.ts`; E2E `v25o` |
| B4 | **O19–O25** (concurrencia de embeddings, muestreo en SQL, `flushMetrics`, sumas en JS, caché de prompts, cuota sin bloqueo) + **S2** acotar `PRECACHE_PATH` + **S3** `verifyRegistration` | Cada uno con prueba o medida; sin cambio de comportamiento | Unitarias + E2E `v25d`, `security` |

(Numeración: ninguna versión es estructural, por eso todas son «menores»; saltar a 3.0 solo tendría sentido ante un cambio de arquitectura.)

## Trazabilidad
| Grupo | Destino |
|---|---|
| O1, O2, O6, O7, O12, O15 | Hechos (B1/B2 de optimización) |
| **O3** | **Ya hecho en código**; v2.7 B1 solo verifica su alcance |
| O4, O5, O18 | v2.7 B2, B3, B1 |
| O8, O9 | v2.8 B4 |
| O10, O11, O13 | v2.9 B1 (O13 condicionado a la extensión) |
| O14 | v2.9 solo si se mide beneficio; si no, fuera |
| O16, O17, O19–O25 | v2.11 B3, B4 |
| N1, N2, N5 | v2.8 B1, B2, B3 |
| N3, N4 | v2.9 B2, B3 (+ B4 temporizador) |
| N6, N10, N11 | v2.11 B1, B2 |
| N7, N8, N9 | v2.10 B3, B1, B2 |
| C1 | Hito 0 → v2.6.2 |
| C2, C3, C7 | v2.6.1 |
| C4 | v2.11 B1 |
| C5 | Fuera: sin causa reproducida (reabrir si reaparece) |
| C6 | Fuera por ahora: tema > 150 000 caracteres, avisado; reabrir si ocurre |
| S1 | v2.7 B4 |
| S2, S3, S8 | v2.11 B4 (S8: solo vigilar Node) |
| S4–S7, S9 | Hito 0 |
| L1–L4 | IA local (propuesta, tras PR #120) |
| S10 | Fuera: logs del host y Sentry, esfuerzo M sin riesgo actual |

## Decisiones que necesita la usuaria
1. **Hito 0 antes de v2.7:** recomendado sí (al menos S5, S9, S4).
2. **C1:** retirar de la UI (recomendado) o rehacer.
3. **Foco tras v2.7:** el orden propuesto pone Estudio (v2.8–v2.9) antes que Entreno (v2.10) por la evidencia de carencias; el benchmark apunta a Entreno como lo más quieto. Si prefiere invertirlo, v2.10 pasa a v2.8 sin dependencias.
4. **Migración:** confirmar que O13 se hace solo si `pg_trgm` está disponible en el servidor real.
5. **Alcance autorizado:** ¿solo v2.7 y v2.8 ahora?
6. **IA local (L1–L4):** ¿en qué versión entran? L1 es el más urgente (privacidad).

## Cómo lanzar un bloque
Sesión nueva, `/model opus` (diseño) o `sonnet` (implementar), y:
```
Lee docs/estado.md y docs/roadmap-v2-7.md. Haz v2.7 bloque B1 (timeout y cliente de IA).
Terminado = peor caso de espera acotado y probado con un SDK simulado que no responde.
No me preguntes salvo bloqueo. Al acabar: commit, push, actualiza docs/estado.md y abre PR a main.
```
