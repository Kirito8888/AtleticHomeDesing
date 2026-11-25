# Roadmap · Suite de entrenadora (atletas sin cuenta)

> **Propuesta, no compromiso.** Base: `main` tras v3.0.1-preview + importación de `export.xml` (24/11/2026). Solo documentación: no cambia código, esquema ni dependencias.
> Objetivo de la usuaria: tener centralizadas en Atlenza a todas las personas a las que lleva la planificación, **aunque no tengan cuenta**.
> Versión: **v3.3** (v3.2.0 ya está cerrada y fusionada; la Suite lleva migración nueva `20271001080000_v3_3_features`) (el número lo decide la usuaria). **Orden decidido (24/11/2026): primero se termina el tramo movible I–Q de `docs/roadmap-v3-0.md` y después los bloques E.**
> **Confianza:** [Seguro] comprobado en el repo · [Probable] inferencia sólida · [Suponiendo] hueco sin prueba. **Esfuerzo** en sesiones de Claude Code (un bloque = una sesión, ≤ 4 tareas).
> Bloques con prefijo **E** (Entrenadora) para no chocar con las letras de v3.0 (C–T) ni con v3.1 A–C (Apple).

## Lo incómodo primero
1. [Seguro] **Un alias que solo tú conoces es seudonimización, no anonimización** (RGPD, considerando 26): mientras tú puedas saber quién es, sigue siendo dato personal y tú eres la responsable del tratamiento. Decisión de la usuaria (24/11/2026): **fichas con alias, sin nombre real, contacto ni datos sensibles**. Eso baja mucho el riesgo, pero no lo hace desaparecer. Además, en atletismo las marcas con fecha y prueba son públicas: alias + marca exacta + competición permite reidentificar a cualquiera en una búsqueda de resultados.
2. [Seguro] **Contradice la Puerta 0.5 de v3.0** («no abrir el uso a otras atletas»; el Bloque R se cerró con aislamiento estricto entre cuentas). Esto reabre esa decisión: hay que tomarla de forma explícita, no de rebote.
3. [Probable] **Sin cuenta, la atleta no registra nada.** El «seguimiento» será solo lo que tú anotes, salvo que se habilite un enlace de respuesta sin cuenta (E7), que es la pieza con más riesgo (escritura pública). Si lo que buscas es que te devuelvan RPE y sensaciones, el valor real está en E7 o en que acaben teniendo cuenta (E10).
4. [Seguro] **Decidido: nada de salud de terceras (art. 9).** Ni lesiones, ni recuperación, ni ciclo, ni ISAK. La app lo tiene que **impedir** (las rutas de salud dan 403 sobre una ficha), no basta con no rellenarlo.
5. [Probable] **El modelo de datos recomendado (ficha = `User` gestionada sin acceso) tiene una trampa:** toda consulta que recorre usuarias (cron, push, Telegram, informe semanal, estadísticas de admin, limpieza de demo) debe excluirlas. Un filtro olvidado no rompe nada visible, pero manda trabajo a nadie o cuenta mal. Se blinda con una prueba de arquitectura en E1, no con cuidado.
6. [Probable] **Tamaño:** 11 bloques, **15–20 sesiones** + cierre. Si solo quieres «tenerlo centralizado», el mínimo útil es **E1 → E2 → E3 → E11 → E4 → E5** (8–10 sesiones).

## Puerta 0 · decisiones de la usuaria
| # | Decisión | Valor por defecto propuesto | Bloquea | Confianza |
|---|---|---|---|---|
| 0.1 | Modelo de datos de la ficha | **DECIDIDO (24/11/2026): sí.** **`User` gestionada sin acceso** (`managedById`, email marcador no enrutable, sin contraseña, `Account` ni llave) + tabla `ManagedAthlete` con los datos de la ficha. Todo lo existente (planes, sesiones, PMC, marcas, tests) funciona sin duplicar modelos y reclamar la ficha (E10) es casi gratis. Alternativa descartada: tablas paralelas (duplicaría `PlanMeso`, `PlanDay`, `TrainingSession`, `PersonalRecord`…) | E1 en adelante | [Probable]; hay precedente: las cuentas demo (`demoAudience`, `lib/demo/service.ts`) |
| 0.2 | Qué datos guarda una ficha | **DECIDIDO (24/11/2026):** alias elegido por la entrenadora (sin nombre real, email ni teléfono; la app no tiene campo para ellos), **año de nacimiento o categoría** en vez de la fecha completa, disciplina, marcas, umbrales, planes, sesiones, competiciones y tests de rendimiento. Nada de salud. Aviso en el alta: «no escribas el nombre real ni datos de contacto, tampoco en notas» | E1, E3, E6 | [Seguro] decisión de la usuaria |
| 0.3 | Consentimiento y menores | Casilla «tengo su conformidad» + fecha (sin documento ni texto firmado); ficha solo desde 14 años. Se mantiene aunque haya alias: seguir siendo dato personal no cambia con el seudónimo | E1, E11 | [Probable] |
| 0.4 | IA con datos de fichas | **DECIDIDO (24/11/2026): permitida**, para herramientas futuras. Mismas reglas que con cuentas: IA local primero y `LOCAL_AI_ONLY`, nada de salud (las fichas no la tienen), alias en vez de nombre. La casilla de conformidad de E3 menciona el uso con IA; [Probable] un proveedor externo con datos de terceras pide revisarlo antes de activarlo | E4, E6 | [Seguro] decisión de la usuaria |
| 0.5 | Cómo recibe el plan la atleta | PDF/impresión + enlace de solo lectura con token + `.ics`. La respuesta por enlace (E7) va aparte y es opcional | E5, E7 | [Probable] |
| 0.6 | Cuotas | Apunte manual, como `OrgFee` (sin cobro, sin pasarela) | E9 | [Seguro] coherente con «sin Stripe» |
| 0.7 | Varias entrenadoras sobre una ficha | No en v3.2: la ficha es de una entrenadora. Compartirla con el staff de un club, más adelante | E2 | [Probable] |

## Bloques
Columnas: **BD** = ¿toca `prisma/schema.prisma`? · **Ses.** = sesiones estimadas. Migración única de la versión: `20271001080000_v3_3_features`, creada en E1 con `regen-mig.sh` (antes `snapshot.sh --before 20270701080000_v2_9_features 20270801080000_v3_1_features`), solo aditiva, regenerada si otro bloque añade algo.

#### E1 · Fundaciones: ficha gestionada sin acceso
| | |
|---|---|
| Tareas | 1) **Esquema:** `User.managedById` (FK a la entrenadora, `onDelete: Restrict` para no perder fichas en silencio) y tabla `ManagedAthlete` (userId único, coachId, alias, año de nacimiento o categoría, etiqueta/grupo, notas, `consentAt`, `archivedAt`; **sin campos de nombre real ni contacto**). Email marcador no enrutable generado. 2) **Sin acceso:** credenciales, OAuth, llave, recuperación y 2FA rechazan cuentas gestionadas; `requireUser` nunca las resuelve. 3) **Exclusión de procesos:** scheduler, push, Telegram, informe semanal, resumen diario, estadísticas de admin, `doctor.sh`/métricas y limpieza demo filtran `managedById: null`; helper único `realUsers()`. 4) **Prueba de arquitectura:** `architecture.test.ts` falla si un `prisma.user.findMany/count` fuera de `lib/managed/**` no usa el helper; tests de login rechazado |
| BD | **Sí** [Seguro]; crea `v3_3_features` |
| Ses. | 2 [Probable] |
| Terminado = | Una ficha existe, no puede entrar por ninguna vía y ningún job la toca (tests en verde) |

#### E2 · Acceso de la entrenadora a sus fichas
| | |
|---|---|
| Tareas | 1) `mergeGrants` (`lib/auth/session.ts`) añade un permiso implícito sobre las fichas propias: ámbitos LOAD, SESSIONS, PLANNING, REPORTS y `canPlan`; **nunca RECOVERY**. 2) Las vistas de entrenadora existentes (`/coach`, sesión, multi-plan, comparar, «qué pasa si») aceptan fichas sin tocar su lógica. 3) Rutas `[id]` nuevas clasificadas en `route-isolation.int.test.ts`; otra entrenadora o un ADMIN global sin vínculo → 404. 4) Solo COACH/ADMIN con 2FA (regla v3.0 D) puede crear fichas |
| BD | No [Probable] |
| Ses. | 1–2 [Probable] ([Suponiendo] según cuántos servicios lean `athleteId` sin pasar por grants) |
| Terminado = | La entrenadora ve el PMC y las sesiones de su ficha; otra cuenta recibe 404 en todas las rutas |

#### E3 · Cartera de atletas (UI)
| | |
|---|---|
| Tareas | 1) `/coach/athletes`: lista única de atletas con cuenta y fichas (distintivo «sin cuenta»), búsqueda, filtro por grupo, archivadas aparte. 2) Alta rápida en 1 pantalla: alias, disciplina, año o categoría, grupo y casilla de conformidad (obligatoria), con el aviso de no poner el nombre real. 3) Ficha: perfil deportivo, marcas, umbrales, competiciones, notas; editar y archivar. 4) E2E `e2e:entrenadora` a 390 px (alta, ficha, archivar, aislamiento) |
| BD | No [Probable] (usa E1) |
| Ses. | 1–2 [Probable] |
| Terminado = | Dar de alta una ficha en ≤ 1 minuto a 390 px y verla junto a las atletas con cuenta |

#### E11 · RGPD de las fichas (va **antes** de meter datos reales)
| | |
|---|---|
| Tareas | 1) Exportar una ficha (JSON + CSV) para atender el art. 15/20 en nombre de la atleta. 2) Borrar una ficha de verdad (cascada) con confirmación escrita; limitación del tratamiento (art. 18) bloquea planificar, igual que con cuentas. 3) Retención: aviso en el panel a los N meses de archivada (N en prefs, no en el código). 4) Las rutas de salud (recuperación, lesiones, ciclo, ISAK, salud de la mujer) responden 403 sobre una ficha (test). Al importar el PDF del plan en una ficha (E4), aviso si el texto contiene el nombre real; `docs/rgpd` con una nota breve del tratamiento |
| BD | [Probable] No (campos en E1); [Suponiendo] sí si se quiere un histórico de consentimientos |
| Ses. | 1 [Probable] (menos trabajo gracias al alias) |
| Terminado = | Cualquier ficha se exporta y se borra entera desde la UI; ninguna ruta de salud acepta una ficha |

#### E4 · Planificaciones por atleta
| | |
|---|---|
| Tareas | 1) Importar el PDF del plan **en la ficha** (`plan-import/service.ts` con atleta destino explícita; [Suponiendo] hoy toma la usuaria de la sesión). 2) Crear plan manual y copiar plantilla/semana tipo a la ficha (reutiliza `manual-plan.ts`). 3) `multi-plan.ts` acepta listas mixtas cuenta + ficha; en fichas la entrenadora es quien confirma el borrador (sigue «borrador → aceptar»). 4) Cambio de versión del plan, afinamiento y competiciones en la ficha; E2E |
| BD | No [Probable] |
| Ses. | 2 [Probable] |
| Terminado = | Subir el PDF de una atleta sin cuenta, revisarlo como borrador y activarlo en su ficha |

#### E5 · Entrega a la atleta
| | |
|---|---|
| Tareas | 1) PDF/impresión del plan con el nombre de la ficha (`/print/plan`). 2) Enlace público de **solo lectura** del plan: token de 32 bytes con hash, caducidad, revocable, límite por IP (patrón `SharedReport`/`CalendarFeed`). 3) `.ics` por ficha **sin** datos de salud. 4) `doctor.sh` (`PUBLIC_ROUTES`, `PRIVATE_API`, `POST_ONLY_API`) y `selftest.sh` |
| BD | **Sí** [Probable]: tabla de enlaces de plan (o `SharedReport` ampliado) |
| Ses. | 1–2 [Probable] |
| Terminado = | La atleta abre su plan desde el móvil sin cuenta; al revocar, el enlace da 404 |

#### E6 · Seguimiento por la entrenadora
| | |
|---|---|
| Tareas | 1) Marcar sesión hecha/no hecha con RPE, duración y nota desde la ficha en 1–2 toques. 2) Marcas y tests de rendimiento anotados por la entrenadora. 3) Cumplimiento (`compliance.ts`) y PMC por ficha. 4) Comparar fichas y cuentas en `compare.ts` |
| BD | No [Probable] |
| Ses. | 1–2 [Probable] |

#### E8 · Panel de la entrenadora
| | |
|---|---|
| Tareas | 1) Planes que terminan en ≤ 7 días y atletas sin plan activo. 2) Competiciones próximas de todas (calendario conjunto). 3) Fichas sin registro en X días (X en prefs). 4) Entrada desde «Hoy» para el rol COACH, sin cargar consultas de más (medir como `docs/ttfb-v2-4.md`) |
| BD | No [Probable] |
| Ses. | 1 [Probable] |

#### E9 · Cuotas de las fichas
| | |
|---|---|
| Tareas | 1) Apunte de cuota por ficha (concepto, importe, vencimiento, pagada/pendiente), sin cobro. 2) Resumen mensual pendiente/cobrado. 3) Enlace opcional a Finanzas como ingreso (borrador → aceptar). 4) Tests |
| BD | **Sí** [Suponiendo]: `OrgFee` cuelga de `OrgMember`; hace falta tabla propia o un «grupo» privado de la entrenadora. Se decide al diseñar E1 |
| Ses. | 1 [Probable] |

#### E10 · Reclamar la ficha (la atleta se registra)
| | |
|---|---|
| Tareas | 1) Invitación con token de un uso desde la ficha. 2) Al registrarse y aceptar, la ficha pasa a cuenta normal (se quita `managedById`, email real) y se crea `CoachAthlete` ACTIVE con los ámbitos que **elija la atleta** (RECOVERY desmarcado, `COACH_RECOVERY` aparte). 3) La atleta puede borrar el histórico antes de aceptar. 4) E2E del paso completo |
| BD | No [Probable] |
| Ses. | 1–2 [Probable] |
| Terminado = | La atleta hereda su histórico como dueña y la entrenadora conserva solo lo que ella permita |

#### E7 · Respuesta por enlace sin cuenta (opcional, el más arriesgado)
| | |
|---|---|
| Tareas | 1) Desde el enlace de E5: hecho/no hecho, RPE y comentario corto por sesión; nada más. 2) Límite por token e IP, tamaño acotado, sin HTML, idempotente. 3) Lo recibido entra como **borrador** que la entrenadora acepta. 4) Prueba de abuso (token filtrado) y `doctor.sh` |
| BD | [Probable] Sí (bandeja de respuestas) |
| Ses. | 2 [Suponiendo] |
| Por qué al final | Es la única escritura pública sin cuenta de toda la app; solo si E3–E6 se usan de verdad |

## Orden recomendado y estimación
| Tramo | Bloques | Sesiones | Confianza |
|---|---|---|---|
| Mínimo útil | E1 → E2 → E3 → E11 → E4 → E5 | 8–10 | [Probable] |
| Seguimiento | E6 → E8 → E9 | 3–4 | [Probable] |
| Paso a cuenta y respuesta | E10 → E7 | 3–4 | [Suponiendo] |
| Cierre | `e2e.sh all` + `e2e:entrenadora`, `test-migration.sh`, Semgrep, licencias, CHANGELOG, guía, `docs/migracion-v3-2-a-v3-3.md`, `doctor.sh` (`EXPECTED_MIGRATION`, rutas nuevas) | 1–2 | [Seguro] |

- E1 antes que todo; E11 antes de cargar fichas reales; E5 antes que E7; E10 en cualquier momento tras E4.
- Nada de esto se despliega a mitad de versión (incidente de v2.5).

## Fuera de alcance (descartado a propósito)
| Qué | Por qué |
|---|---|
| Datos de salud en fichas (lesiones, recuperación, ciclo, ISAK) | Art. 9 de terceras sin cuenta; revisar con abogado |
| Cobros, chat o mensajería con la atleta | Igual que en clubes: pasarela, moderación y menores |
| Importar contactos o datos de otras apps de entrenadoras | Scraping prohibido; sin API oficial evaluada |

## Riesgos
- [Probable] Filtro olvidado de cuentas gestionadas en jobs o estadísticas → lo cubre la prueba de arquitectura de E1.
- [Suponiendo] `plan-import` y otros servicios pueden suponer que la dueña es la usuaria de la sesión: E4 puede crecer.
- [Probable] El enlace público (E5/E7) es superficie nueva sin cuenta: token con hash, caducidad, límite y `e2e:security`.
- [Seguro] Puerta 0.2 decidida (alias, sin salud); la 0.3 sigue sin revisión de un abogado. [Probable] El PDF del plan puede llevar el nombre real en la portada: E4 avisa, pero no lo borra.

## Plantilla de encargo por bloque
```
Lee docs/estado.md, CLAUDE.md y docs/roadmap-entrenadora.md. Haz el Bloque E<n> (<nombre>).
Decisiones: <las de la puerta 0 que afecten>.
Terminado = <la fila «Terminado =» del bloque>.
No me preguntes salvo bloqueo. Al acabar: commit, push y actualiza docs/estado.md.
```
