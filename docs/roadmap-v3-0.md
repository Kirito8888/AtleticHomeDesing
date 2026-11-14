# Roadmap v3.0 · propuesta por bloques para autorizar (Bloque B)

> **Propuesta, no compromiso.** Base: `main` tras v2.11.0 + Ops `doctor.sh`; cruza **todos** los hallazgos de `docs/auditoria-v3-0.md` (IDs V3-S, V3-A, V3-D, V3-N, V3-L). Fecha: 14/11/2026.
> Solo documentación: no cambia código, esquema, dependencias ni `package.json`. Qué se autoriza, en qué orden y el número de versión final lo decide la usuaria; Claude no empieza un bloque sin encargo.
> **Confianza:** [Seguro] comprobado en el repo o en la auditoría · [Probable] inferencia sólida · [Suponiendo] hueco sin prueba (código no leído o sin uso real).
> **Esfuerzo:** en sesiones de Claude Code (un bloque = una sesión, `docs/como-trabajar.md`). No incluye el tiempo de prueba de la usuaria.

## Lo incómodo primero
1. [Seguro] **La auditoría solo trae funciones nuevas de peso para Nutrición (V3-N01) y Clubes (V3-N04).** Entreno solo tiene V3-N05 (registro sin red), Estudio V3-N03 (pequeña) y **Finanzas ninguna** (V3-N06, exportación guiada, es transversal). No relleno huecos con funciones inventadas: en Finanzas v3.0 es rediseño + exportación. Si se quieren novedades de Finanzas o Entreno, hace falta otra ronda de benchmark o, mejor, uso real registrado (`docs/analisis-competencia-feedback.md` § 2.4 sigue vacío).
2. [Probable] **Son 18 bloques + cierre: v3.0 completa son semanas de sesiones y de pruebas de la usuaria.** Por eso hay un **núcleo mínimo de v3.0** (10 bloques) y un **tramo movible** (8 bloques de verticales y producto) que puede salir como v3.1 sin romper nada. Mi recomendación: autorizar solo el núcleo y decidir el tramo movible con 2–3 semanas de uso del rediseño.
3. [Seguro] **Licencia:** el encargo pide «uso personal y no comercial» y `LICENSE` dice «todos los derechos reservados». Son modelos distintos (auditoría § 7.2). Este roadmap aplica la **opción 1** (aviso informativo; la licencia restringida sigue mandando) porque es reversible y coherente con el texto actual. La opción 2 (licencia no comercial tipo PolyForm) **cede derechos sobre lo ya publicado y no se puede deshacer**: no entra en ningún bloque hasta que haya revisión legal y decisión explícita.
4. [Probable] **Rediseñar rompe E2E.** Hay ~49 suites y muchas buscan textos y `data-testid`. Cada bloque de rediseño reserva una de sus 4 tareas para adaptar su suite; si no cabe, el bloque se parte, no se salta la prueba.
5. [Seguro] **No hay ni una prueba de usabilidad con personas reales** (auditoría § 4). Un «rediseño total» validado solo por la usuaria y por axe es una apuesta: el bloque T pide 1 pasada manual con lector de pantalla y el bloque G pide un prototipo de «Hoy» antes de rehacer pantallas.
6. [Probable] **V3-S01 (2FA obligatoria) puede dejar fuera a la propia administradora** si se activa sin periodo de gracia ni códigos de recuperación a mano. Va con gracia y aviso, y se prueba el camino de recuperación antes de desplegar.

## Criterios y reglas de corte
1. **Orden:** avisos legales (baratos, piden las decisiones) → seguridad Alta/Media barata → fundaciones transversales (accesibilidad, sistema visual, navegación) → «Hoy» → endurecimiento → accesibilidad manual. Los rediseños por vertical y las funciones nuevas van **después** de las fundaciones para no rehacer pantallas dos veces.
2. **Bloque = ≤ 4 tareas, una sesión.** Cada bloque cierra con typecheck, lint, tests de lo tocado, su suite E2E, commit, push y `docs/estado.md` (CLAUDE.md § Verificación).
3. **Migración:** una sola para la versión, `<AAAAMMDDhhmmss>_v3_0_features`, creada en el **primer** bloque que toque el esquema (hoy: P) con `regen-mig.sh` y regenerada si otro bloque añade algo. Antes: `snapshot.sh --before 20270701080000_v2_9_features`. Solo aditiva. **No desplegar `main` a mitad de versión** (incidente de v2.5).
4. **Reglas fijas no negociables en el rediseño:** salud cifrada (ciclo, salud de la mujer, ISAK) fuera de IA, entrenadora, informe semanal y `.ics`; recuperación sin ámbito RECOVERY fuera del prompt; Strava fuera de IA y entrenadora; nada escribe en el plan (ni en objetivos de nutrición) sin «borrador → aceptar»; IA local primero y `LOCAL_AI_ONLY`; repo público.
5. **Rutas nuevas o movidas** (p. ej. `/today`, `/legal/accesibilidad`, `/about`): se anotan para el bloque «ACTUALIZAR EN CADA CIERRE DE VERSIÓN» de `scripts/ops/doctor.sh` en el cierre.
6. **El cierre de versión es una sesión aparte** y no cuenta como bloque.

## Puerta 0 · decisiones de la usuaria (bloquean los bloques indicados)
| # | Decisión | Valor por defecto propuesto | Bloquea | Confianza en el defecto |
|---|---|---|---|---|
| 0.1 | Modelo de licencia (V3-L01) | Opción 1: aviso informativo «proyecto personal, uso personal y no comercial», licencia restringida intacta, cabecera «pendiente de revisión legal» | C | [Seguro] es el cambio mínimo y reversible |
| 0.2 | 2FA para ADMIN/COACH (V3-S01) | **Obligatoria** con 14 días de gracia y aviso; alta de ADMIN nueva solo con 2FA | D | [Probable] |
| 0.3 | Barra móvil (V3-D01) | Configurable por la usuaria, con valor inicial calculado del uso (`UsageBeacon`) | G | [Probable] |
| 0.4 | Quién prueba el rediseño | 3–5 personas, al menos una con lector de pantalla | G, T | [Suponiendo] que hay quien pueda |
| 0.5 | ¿Se abre el uso a otras atletas? | No en v3.0; si sí, sube la prioridad de S08 y N04 (menores) | R, P, Q | [Probable] |
| 0.6 | Verticales que se rediseñan en v3.0 | Ninguna en el núcleo; I–O en el tramo movible | I–O | [Probable] |

## Bloques
Columnas: **BD** = ¿toca `prisma/schema.prisma`? · **Ses.** = sesiones estimadas con confianza.

### Núcleo mínimo de v3.0

#### C · Avisos de autoría y uso no comercial — HECHO (14/11/2026, ver `docs/estado.md`)
| | |
|---|---|
| Tareas | 1) `README.md`: el banner actual pasa a «© 2026 David Ornelas Luna · proyecto personal para uso personal y no comercial · todos los derechos reservados» (V3-L01). 2) `LICENSE`: cabecera informativa con la misma frase y la marca **«Pendiente de revisión legal»**, sin tocar las cláusulas 2–3. 3) Pie de una línea en `(app)/layout.tsx` y en el layout de `(auth)` con enlace a `/legal/aviso` (V3-L02 prioridad 1). 4) Alinear `/legal/aviso`, `/legal/condiciones`, `terms-gate.tsx` y `/about` (versión, autoría, licencia, terceros) con la frase, sin contradecir la licencia |
| BD | No [Seguro] |
| Ses. | 1 [Seguro] |
| Pruebas | Typecheck, lint, E2E base (pie visible en login y en una página autenticada a 390 px, enlace accesible por teclado) |
| Terminado = | La frase idéntica en README, LICENSE, pie, aviso legal, condiciones y `/about`; sin dominio, correo ni nombre de servidor en el pie |
| Por qué primero | Lo pidió la usuaria como bloque inicial; es barato y fija el texto que reutilizan T y N (exportaciones) |

#### D · Seguridad 1: autenticación y límites de tasa
| | |
|---|---|
| Tareas | 1) **V3-S01 (Alta):** 2FA (TOTP o llave de acceso) obligatoria para ADMIN y COACH con gracia y aviso persistente; tras la gracia, sin 2FA solo se puede ir a configurarla. 2) **V3-S02 (Media):** `clientIp` con nº de proxies de confianza por variable; sin cabecera, IP del socket; aviso en `doctor.sh --env` si la web no está tras el proxy previsto. 3) **V3-S05 (Baja):** fallar al arrancar fuera de desarrollo si falta `AUTH_SECRET`; quitar el `"dev"` por defecto. 4) **V3-S07 (Info):** el clic de notificación en `sw.js` rechaza `//` y `\` (sube la versión de caché del SW) |
| BD | [Probable] No: la gracia se calcula con una fecha de corte por variable. [Suponiendo] si se quiere gracia por persona (desde que se le asigna el rol), hace falta un campo y entra en `v3_0_features` |
| Ses. | 1–2 [Probable] (S01 es el grueso; si no cabe, S01 solo + resto en la siguiente) |
| Pruebas | Integración: rol sin 2FA dentro/fuera de gracia, recuperación con códigos; `clientIp` con 0/1/2 cabeceras; arranque sin secreto; test del SW. E2E `e2e:security` |
| Terminado = | Una cuenta COACH sin 2FA, pasada la gracia, no ve datos de atletas hasta activarla; los límites por IP no se saltan cambiando la cabecera |

#### E · Cadena de suministro y prueba de arquitectura
| | |
|---|---|
| Tareas | 1) **V3-S03 (Media):** acciones de `.github/workflows/*` fijadas por SHA completo (comentario con la etiqueta) + Dependabot para `github-actions` y npm; `permissions:` mínimo. 2) **V3-S10 (Baja):** comprobar si se usa el micrófono y retirarlo de `Permissions-Policy` si no; `report-to` junto a `report-uri`; documentar la deuda de `style-src 'unsafe-inline'`. 3) **V3-S13:** test de arquitectura que falla si `lib/ai/**` importa `lib/health/isak*` o el ciclo/salud de la mujer. 4) **V3-S11 (Info):** calendario de subida a Node 24 (`unpdf`) y revisión mensual de `npm audit`, en `docs/arquitectura.md` |
| BD | No [Seguro] |
| Ses. | 1 [Seguro] |
| Pruebas | El nuevo test de arquitectura (rojo si se añade un import prohibido, verde hoy); la CI completa debe seguir verde con las acciones por SHA |
| Terminado = | 0 acciones por etiqueta; test de arquitectura en vitest |

#### F · Fundaciones de accesibilidad (WCAG 2.2 AA automatizable)
| | |
|---|---|
| Tareas | 1) **V3-A01:** axe en un recorrido por vertical (Entreno, Plan, Salud, Estudio, Nutrición, Finanzas, Clubes, Ajustes) en claro, oscuro y `.hc`, como suite nueva `e2e:a11y` dentro de `e2e.sh all`. 2) **V3-A03:** sustituir los 21 `text-[9–11px]` fijos por tamaños de la escala que respetan `fontScale`. 3) **V3-A04:** `prefers-reduced-motion` global (modo juego, gráficos, transiciones). 4) **V3-A10:** script que calcula el contraste de todos los pares de tokens (claro, oscuro, `.hc`) y falla < 4,5:1 texto / 3:1 no-texto; verificar de paso V3-A02 (los 6 botones `size-6…9`) |
| BD | No [Seguro] |
| Ses. | 1–2 [Probable] (los fallos que destape axe pueden no caber; se anotan y se arreglan en G o T) |
| Pruebas | `e2e:a11y`, script de contraste en CI, comprobación táctil existente de `e2e` |
| Terminado = | axe sin violaciones serias/críticas en los 8 recorridos × 3 temas, o cada excepción listada con bloque destino |
| Por qué antes del rediseño | Es la red que impide que el rediseño introduzca regresiones de accesibilidad |

#### G · Fundaciones de diseño y navegación
| | |
|---|---|
| Tareas | 1) **Documento de principios + inventario** (`docs/diseno-v3.md`): los 5 principios de V3-D03 (una acción principal por pantalla, detalle bajo demanda, «borrador → aceptar» en todo, estados vacíos que enseñan, modo foco con `hiddenModules`), inventario de `components/ui` y de componentes de cada vertical, y mapa tarea → destino. Se **conservan los tokens** OKLCH. 2) **V3-D01:** menú por intención (agrupación nueva de `nav-items.ts`) y barra móvil configurable en prefs con valor inicial por uso. 3) **V3-D02:** «Atlenza IA» deja de ser `/study`: Estudio se llama Estudio y la IA se presenta donde actúa. 4) **V3-A07:** el foco por teclado nunca queda tapado por la barra fija ni por hojas inferiores (`scroll-padding`/`scroll-margin`) |
| BD | No [Probable]: la barra cabe en el JSON de prefs (`lib/rules/prefs.ts` ya guarda `hiddenModules`) |
| Ses. | 2 [Probable] (el documento y el prototipo de «Hoy» pueden ocupar una sesión entera; partir en G1 = 1, G2 = 2–4 si hace falta) |
| Pruebas | E2E de navegación a 390 px y por teclado; `e2e:a11y`; prueba de prefs (barra guardada y restaurada) |
| Terminado = | Estudio y Finanzas alcanzables en 1 toque si la usuaria los usa; foco visible en todas las pantallas del recorrido |

#### H · «Hoy»: una portada accionable
| | |
|---|---|
| Tareas | 1) **V3-N02:** portada única que dice qué hacer ahora: sesión del día, repasos vencidos, toma pendiente, aviso de recuperación **solo con ámbito propio**. 2) Registro en 1–2 toques desde la portada (serie, toma, agua, gasto) con los componentes existentes. 3) Estados vacíos que enseñan y «por qué» de cada número (reutiliza `lib/training/explain.ts`). 4) Adaptar `e2e:v18` y las suites que entran por la portada |
| BD | No [Probable]: lee datos ya existentes |
| Ses. | 2 [Probable] |
| Pruebas | E2E de portada a 390 px (incluida en fin de semana: `v18` depende del día), `e2e:a11y`, recuento de consultas antes/después (no debe empeorar el TTFB de `docs/ttfb-v2-4.md`) |
| Terminado = | Desde «Hoy» se hace la acción principal del día sin abrir el menú |
| Por qué en el núcleo | Es el mayor recorte de carga cognitiva por coste (auditoría § 0.5) y el patrón que copian luego los verticales |

#### R · Endurecimiento 1: control de acceso y abuso
| | |
|---|---|
| Tareas | 1) **V3-S08 (Media):** inventario de rutas con `[id]` o `athleteId` y prueba negativa sistemática (usuaria A contra B, entrenadora sin ámbito, club ajeno, ADMIN sin atajos) ampliando `scope-isolation.int.test.ts`. 2) Auditar por dentro los servicios de comentarios de sesión, `physio/[id]/shares` y vínculos de club (los 5 que la auditoría no leyó). 3) **V3-S09 (Media):** límite de tasa por usuaria por defecto en el envoltorio `route()` para mutaciones, con excepciones explícitas. 4) Arreglar lo que salga de 1–2 |
| BD | No [Probable] |
| Ses. | 2 [Suponiendo] (el interior no está leído: si aparece un fallo Alto, se arregla aquí y su detalle **no** va al repo) |
| Pruebas | Integración con BD; `e2e:security` |
| Terminado = | Toda ruta con id ajeno da 403/404 en test; las mutaciones tienen límite por usuaria salvo lista justificada |

#### S · Endurecimiento 2: SSRF, caché local y copias
| | |
|---|---|
| Tareas | 1) **V3-S04 (Baja-Media):** resolver el nombre una vez y conectar a esa IP (agente con `lookup` propio); añadir NAT64, 6to4 y la forma hexadecimal de IPv4 mapeada. 2) **V3-S06 (Baja):** purgar las cachés privadas del SW también al detectar 401, TTL de las copias y aviso «dispositivo compartido» en Privacidad. 3) **V3-S12 (Info):** procedimiento de simulacro trimestral de restauración en `docs/servidor-backups.md` (la ejecución es tiempo de la usuaria). 4) Revisión final del inventario de V3-S10/S11 por si quedó algo de E |
| BD | No [Seguro] |
| Ses. | 1 [Probable] |
| Pruebas | Unitarios de la guarda SSRF (rangos nuevos, cambio de DNS simulado); `e2e:v25d` y la caché offline |
| Terminado = | La guarda no se salta con rebinding en test; una sesión caducada no deja copias privadas legibles |

#### T · Accesibilidad manual y declaración
| | |
|---|---|
| Tareas | 1) **V3-A11:** una pasada con teclado y una con lector de pantalla (VoiceOver o TalkBack + NVDA si es posible) sobre «Hoy» y un recorrido por vertical; hallazgos en `docs/auditoria-v3-0.md` § 5. 2) **V3-A12:** alternativa en tabla o texto de los gráficos (PMC, finanzas, composición **solo para la propia usuaria**). 3) **V3-A05:** confirmar que los toasts de `sonner` se anuncian; arreglar si no. 4) Página `/legal/accesibilidad` (declaración: alcance, estado, contacto genérico) y verificación de V3-A06/A08/A09 |
| BD | No [Seguro] |
| Ses. | 1 de Claude + tiempo de la usuaria o de quien pruebe [Probable] |
| Pruebas | `e2e:a11y`, E2E de la página legal; la pasada manual queda documentada |
| Terminado = | Declaración publicada con el resultado real, no con «cumple» por defecto |

### Tramo movible (v3.0 si da tiempo; si no, v3.1)

#### I · Rediseño Entreno
| | |
|---|---|
| Tareas | 1) **V3-D04:** reabrir P2-2…P2-12 de `docs/auditoria-ui.md` (registrador de fuerza, temporizador, técnica) y dejar todo objetivo ≥ 44 px a 390 px. 2) Composición de sesión/plan con los principios de G (una acción principal, detalle plegado). 3) «Por qué» de cada número en rendimiento (reutiliza `explain.ts`). 4) Adaptar `v210a`, `v25b`, `v25g` |
| BD | No [Seguro] |
| Ses. | 1–2 [Probable] |
| Terminado = | Registrar una serie a 390 px sin objetivos < 44 px y sin perder precarga ni descanso (N8) |

#### J · Entreno sin red (V3-N05)
| | |
|---|---|
| Tareas | 1) Ampliar la cola local existente a series y tomas con clave idempotente (patrón `clientKey` de `StudySession`). 2) Reintento al volver la red y aviso de pendientes. 3) Coordinar con V3-S06: lo pendiente se cifra o se purga al cerrar sesión. 4) E2E sin red (patrón `v25d`) |
| BD | [Probable] No si reutiliza claves idempotentes existentes; [Suponiendo] si las series no tienen una, hace falta un campo → `v3_0_features` |
| Ses. | 2 [Suponiendo] (no está leída la cola actual de entreno) |
| Por qué | Impacto medio y real (pista y gimnasio sin cobertura); riesgo medio por datos locales |

#### K · Rediseño Estudio + V3-N03
| | |
|---|---|
| Tareas | 1) Composición de `/study` con los principios de G (TDAH: una tarea a la vista, temporizador único). 2) **V3-N03:** tope diario de repasos (pref). 3) **V3-N03:** «guardar a flashcards» desde Resumir donde falte (N2 lo cubrió en parte en v2.8: verificar antes). 4) Adaptar `e2e:practica`, `quest` y las de estudio |
| BD | No [Probable] |
| Ses. | 1–2 [Probable] |
| Por qué | Estudio es de lo más usado; N03 es barata y reduce sobrecarga |

#### L · Rediseño Nutrición
| | |
|---|---|
| Tareas | 1) Composición día/toma con «Hoy» como entrada. 2) «+ Alimento» (Menús, Recientes, Buscar) con una acción principal. 3) Zonas de `zone-refresh` intactas (sin RSC de más). 4) Adaptar `v25f`, `v25i` |
| BD | No [Seguro] |
| Ses. | 1 [Probable] |

#### M · Gasto energético adaptativo (V3-N01)
| | |
|---|---|
| Tareas | 1) Cálculo **determinista y local, sin IA**: media móvil del peso + ingesta registrada → gasto estimado (lógica pura con tests). 2) «Aún calibrando» con < 3 semanas o datos escasos; nunca un número inventado. 3) Borrador semanal de objetivo → «Aceptar» escribe el `NutritionGoal` existente (regla de confirmación). 4) Topes de cambio por semana, sin mensajes de déficit agresivo, enlace a un profesional; el peso no sale hacia IA ni entrenadora |
| BD | [Probable] No (cálculo al vuelo, escribe `NutritionGoal`). [Suponiendo] guardar el historial de estimaciones pediría una tabla → `v3_0_features` |
| Ses. | 2 [Probable] |
| Por qué | Impacto alto (auditoría § 3.3), sin dependencia de IA y con el patrón ya validado por el mercado; riesgo de salud controlado con topes |

#### N · Rediseño Finanzas + exportación guiada (V3-N06)
| | |
|---|---|
| Tareas | 1) Composición de `/finance` con los principios de G (las zonas de B3 se conservan). 2) **V3-N06:** exportación guiada de los datos de la usuaria (no solo ops), con lo cifrado fuera salvo petición expresa de la propia usuaria. 3) **V3-L02 prioridad 5:** pie de autoría en exportaciones (manual PDF, informe semanal, `.ics`, informe para la médica) sin datos de la instalación. 4) Adaptar `v25h`, `v25k` |
| BD | No [Probable] |
| Ses. | 1–2 [Probable] |
| Por qué | Finanzas no tiene funciones nuevas en la auditoría; N06 refuerza RGPD (art. 20) y es barata |

#### O · Rediseño Clubes
| | |
|---|---|
| Tareas | 1) Panel del club y membresías con el sistema nuevo. 2) Vista de entrenadora coherente con «Hoy». 3) Comprobación de ámbitos tras el cambio visual. 4) Adaptar las E2E de clubes/coach |
| BD | No [Seguro] |
| Ses. | 1 [Probable] |

#### P · Asistencia a eventos del club (V3-N04, parte A)
| | |
|---|---|
| Tareas | 1) **Esquema:** evento de club (fecha, título, lugar opcional) y respuesta por miembro (sí/no/quizá) enlazados a `OrgMember`; **crea `v3_0_features`** (`snapshot.sh` antes). 2) API con aislamiento por club (miembro solo ve su club; entrenadora solo los suyos). 3) UI: lista de eventos, responder en 1 toque, resumen de asistencia. 4) Cuota del evento como «pagada/pendiente» con `OrgFee` (**sin cobro ni chat**) |
| BD | **Sí** [Seguro] (hoy no hay modelo de eventos de club: solo `OrgMember`, `OrgFee` y `CalendarEvent` personal) |
| Ses. | 2 [Probable] |
| Por qué / descartes | Impacto medio, patrón Spond. **Fuera:** cobros (intermediario y normativa financiera) y chat (moderación y menores) |

#### Q · Recordatorios de asistencia (V3-N04, parte B)
| | |
|---|---|
| Tareas | 1) Recordatorio push/Telegram a quien no ha respondido (cola pg-boss, con tope). 2) Resumen para la entrenadora. 3) Pruebas de menores y ámbitos (art. 18). 4) Entrada en el `.ics` **sin** datos de salud |
| BD | [Probable] No (si P ya creó el modelo) |
| Ses. | 1 [Probable] |

### Cierre de v3.0 (sesión aparte)
`e2e.sh all` (con `e2e:a11y` nueva y lanzado también en fin de semana), `test-migration.sh` si hay `v3_0_features` (antes `snapshot.sh --before 20270701080000_v2_9_features`), Semgrep, licencias, `npm audit --omit=dev`, CHANGELOG, guía de usuaria, `docs/migracion-v2-11-a-v3-0.md`, `doctor.sh` (`EXPECTED_MIGRATION`, rutas nuevas como `/legal/accesibilidad`) y `selftest.sh`, `package.json` al número que decida la usuaria, PR. Después: la usuaria fusiona, despliega con `update.sh` y resube los adjuntos del Gem.

## Orden recomendado y estimación total
| Tramo | Bloques | Sesiones | Confianza |
|---|---|---|---|
| Núcleo | C → D → E → F → G → H → R → S → T | 12–15 | [Probable] |
| Movible | I → J → K → L → M → N → O → P → Q | 12–15 | [Suponiendo] (depende de lo que rompan los rediseños) |
| Cierre | — | 1–2 | [Seguro] |

- C, D y E son independientes entre sí: se pueden reordenar. F debe ir antes de G; G antes de H y de todos los rediseños; P antes de Q.
- [Probable] Si solo se autoriza el núcleo, v3.0 no lleva migración (ningún bloque del núcleo toca el esquema salvo la variante de D con gracia por persona).

## Justificación de la selección de funciones
| ID | Decisión | Impacto | Viabilidad | Riesgo | Motivo |
|---|---|---|---|---|---|
| V3-N02 «Hoy» | **Núcleo (H)** | Alto | Media (L) | Bajo | Es la palanca principal contra la carga cognitiva y el patrón del resto del rediseño |
| V3-N01 gasto adaptativo | Movible (M), primera función nueva | Alto | Media | Medio (salud) | Sin IA, datos ya existentes; cierra el bucle peso ↔ objetivo |
| V3-N04 asistencia en clubes | Movible (P, Q) | Medio | Media | Medio (menores) | Único bloque con BD; sin pagos ni chat por diseño |
| V3-N05 entreno sin red | Movible (J) | Medio | Media | Medio | Útil en pista; el riesgo de datos locales se trata con S06 |
| V3-N03 tope de repasos | Movible (K) | Medio | Alta (S) | Bajo | Barata; parte ya hecha en v2.8 (N2): verificar antes de rehacer |
| V3-N06 exportación guiada | Movible (N) | Medio | Alta (S) | Bajo | Refuerza RGPD; da a Finanzas algo más que rediseño |
| Pagos en clubes | **Descartado** | — | Baja | Alto | Intermediario de pago, normativa y datos de tarjeta |
| Chat en clubes | **Descartado** | — | Media | Alto | Moderación y datos de menores |

## Mapa hallazgo → bloque (ninguno sin destino)
| Hallazgo | Bloque | Nota |
|---|---|---|
| V3-S01 (Alta) | D | |
| V3-S02, V3-S05, V3-S07 | D | |
| V3-S03, V3-S10, V3-S11, V3-S13 | E | S11 también en S (revisión) |
| V3-S04, V3-S06, V3-S12 | S | S06 se coordina con J |
| V3-S08, V3-S09 | R | |
| V3-A01, V3-A03, V3-A04, V3-A10 | F | V3-A02 se verifica en F |
| V3-A07 | G | |
| V3-A05, V3-A11, V3-A12 | T | V3-A06, V3-A08, V3-A09 se dan por cumplidos y se verifican en T |
| V3-D01, V3-D02, V3-D03 | G | D01 también en H |
| V3-D04 | I | |
| V3-N01 | M | |
| V3-N02 | H | |
| V3-N03 | K | |
| V3-N04 | P, Q | |
| V3-N05 | J | |
| V3-N06 | N | |
| V3-L01 | Puerta 0.1 + C | Opción 2 fuera hasta revisión legal |
| V3-L02 | C (prioridades 1–4), N (prioridad 5) | Prioridades 6–7: no se hace nada (correcto hoy) |

## Riesgos de la versión
- [Seguro] Migraciones solo aditivas y una por versión: un rediseño que quiera mover datos no puede; si P y otro bloque tocan el esquema, se regenera la misma migración.
- [Probable] Romper E2E: presupuesto de una tarea por bloque de rediseño; las suites que dependen del día de la semana (`v18`, `v25c`) se lanzan también en sábado o domingo.
- [Probable] Rendimiento: «Hoy» junta datos de varias verticales; medir consultas antes y después (método de `docs/ttfb-v2-4.md`).
- [Suponiendo] El interior de los servicios con `athleteId` (R) puede destapar trabajo que no cabe en 2 sesiones.
- [Seguro] Nada de esto está probado con personas reales: la puerta 0.4 es la que más cambia la calidad del resultado.

## Plantilla de encargo por bloque
```
Lee docs/estado.md, CLAUDE.md y docs/roadmap-v3-0.md. Haz v3.0 Bloque <letra> (<nombre>).
Decisiones: <las de la puerta 0 que afecten>.
Terminado = <la fila «Terminado =» del bloque>.
No me preguntes salvo bloqueo. Al acabar: commit, push y actualiza docs/estado.md.
```
