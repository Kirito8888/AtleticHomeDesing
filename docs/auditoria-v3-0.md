# Auditoría v3.0 · producto, diseño, accesibilidad, seguridad y propiedad intelectual (Bloque A)

> Base técnica para planificar la versión mayor 3.0. **Solo documentación**: no cambia código, esquema ni dependencias. El roadmap definitivo (`docs/roadmap-v3-0.md`) es el Bloque B.
> Fecha: 14/11/2026 · Base: `main` tras v2.11.0 + Ops `doctor.sh` · Autoría de la revisión: IA, lectura estática.
> **El repo es público:** este documento describe clases de fallo y ubicaciones, **no** pruebas de concepto, cargas útiles ni datos del servidor real. Cualquier hallazgo Alto o Crítico explotable que aparezca en una revisión posterior se resume aquí como «pendiente» y su detalle va fuera del repo.

**Leyenda de confianza.** [Seguro] visto en código, comando o fuente citada · [Probable] inferencia sólida · [Suponiendo] hueco rellenado sin prueba.
**Severidad.** Crítica (explotable sin sesión, con impacto en datos) · Alta · Media · Baja · Info. CVSS solo orientativo, no calculado.

## 0. Lo incómodo primero

1. [Seguro] **Esta auditoría es estática.** No se ejecutó la app, no hubo pruebas de penetración activas ni uso real. Que no aparezca un Crítico significa «no lo vi leyendo», no «no existe». El hueco más grande sigue siendo lo que ya reconocía `docs/estado.md`: IA real, imagen Docker real y servidor real sin probar en varias zonas.
2. [Seguro] **La licencia actual contradice el encargo.** `LICENSE` es «todos los derechos reservados; usar, ejecutar o instalar exige permiso escrito». «Uso personal y no comercial» es **otro modelo** (permiso general para terceros con límites). No se pueden decir las dos cosas a la vez. Decisión de la usuaria + revisión legal (§ 7).
3. [Seguro] **No hay pie de interfaz con aviso de autoría en la app autenticada.** El copyright vive en `README.md`, `LICENSE`, `/legal/*` y la puerta de condiciones; en `(app)/layout.tsx` no hay pie (§ 7).
4. [Probable] **No he visto que se exija verificación en dos pasos a ADMIN ni a COACH.** TOTP y llaves de acceso existen, pero un `grep` de «obligatorio» por rol no encontró nada. Es el control de mayor valor por coste de esta lista (V3-S01).
5. [Probable] **El diseño actual es denso, no roto.** 91 páginas, 14 destinos de menú en 4 grupos, 237 usos de `min-h-11`: la base táctil es buena. El problema para TDAH no es el tamaño de los botones, es cuántas decisiones hay por pantalla y que «Atlenza IA» apunta a `/study` (nombre y función no coinciden).
6. [Seguro] **El benchmark de nutrición y clubes es nuevo; el de fuerza, estudio y finanzas ya existía** (`docs/analisis-competencia-feedback.md`) y aquí solo se enlaza. Sigue sin haber feedback de uso real fuera de la usuaria y quien desarrolla.

### Top 10 (orden de prioridad propuesto)
| # | ID | Qué | Tipo | Esfuerzo |
|---|---|---|---|---|
| 1 | V3-S01 | 2FA obligatoria (o recomendada con aviso) para ADMIN/COACH | Seguridad | S |
| 2 | V3-L01 | Decidir el modelo de licencia y alinear LICENSE, README, aviso legal y condiciones | Legal | S (+ revisión legal) |
| 3 | V3-S02 | `clientIp` y límites de tasa: depende de exactamente un proxy; sin cabecera, todos comparten cubo `unknown` | Seguridad | S |
| 4 | V3-S03 | Fijar acciones de GitHub por SHA y vigilar actualizaciones | Cadena de suministro | S |
| 5 | V3-L02 | Pie de interfaz con aviso de autoría (login, `/about`, menú, exportaciones) | Legal/UI | S |
| 6 | V3-A01 | Barrido WCAG 2.2 AA completo con revisor humano + lector de pantalla (axe solo cubre 3 suites) | Accesibilidad | M |
| 7 | V3-D01 | Reducir carga cognitiva: «Hoy» como única portada accionable, menú por intención | Diseño | L |
| 8 | V3-S04 | Endurecer la guarda SSRF de proveedores de IA (rebinding, rangos IPv6/NAT64) | Seguridad | S |
| 9 | V3-N01 | Nutrición: gasto energético adaptativo con tendencia de peso (patrón MacroFactor) | Producto | M |
| 10 | V3-N04 | Clubes: cuotas y asistencia enlazadas a calendario con aviso a quien no ha respondido | Producto | M |

---

## 1. Alcance y método
- **Leído:** `src/proxy.ts`, `src/auth.ts`, `src/lib/auth/*`, `src/lib/security/*`, `src/lib/ai/provider.ts`, `src/lib/rate-limit.ts`, `public/sw.js`, `next.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/workflows`, `src/app/(app)/layout.tsx`, `components/layout/*`, `globals.css`, páginas legales, `LICENSE`, `README.md`, `package.json`, y los documentos citados en cada sección.
- **Medido con comandos (solo lectura):** 91 `page.tsx`, 271 `route.ts`, 130 modelos Prisma, `npm audit --omit=dev` → **0 vulnerabilidades** [Seguro, 14/11/2026].
- **Cribado de ámbitos:** de los 271 manejadores de API, 7 no contienen ninguna guarda de sesión conocida; **los 7 son públicos a propósito** (registro, `nextauth`, `csp-report`, opciones de llave de acceso, y tres enlaces con token: informe de salud para profesionales, informe para la entrenadora y `.ics`) y los que he abierto limitan por IP y validan el formato del token [Seguro]. Otros 5 aceptan `athleteId` sin llamar a `resolveAthleteId` en la propia ruta: delegan en servicios (comentarios de sesión, protocolos fisio) o lo ignoran por diseño (ciclo, salud de la mujer, composición); **no he auditado el interior de esos servicios** [Suponiendo que filtran bien; hay que probarlo, V3-S08].
- **No hecho:** ejecución de la app, fuzzing, revisión de datos reales, pruebas de carga, lectura línea a línea de las 271 rutas, benchmark con las apps instaladas. El benchmark sale de páginas públicas citadas en § 9 (sin scraping).
- **Reutilizado sin repetir:** `analisis-competencia-feedback.md`, `arquitectura.md` § Auditoría (O1–O25), `auditoria-ui.md` (v2.3), `seguridad-incidentes.md`, `servidor-hardening.md`, `rgpd/`.

## 2. Inventario por vertical [Seguro salvo indicación]
| Vertical | Dónde | Notas para v3.0 |
|---|---|---|
| Entreno y plan | `/training`, `/planning`, `lib/training`, `lib/planning` | PMC, prescripción con citas, precarga y descanso (v2.10) |
| Recuperación y salud | `/recovery`, `lib/recovery`, `lib/health` | Ámbito RECOVERY; ciclo e ISAK cifrados, fuera de IA y entrenadora |
| Estudio / TDAH | `/study`, `lib/study`, `lib/ai/*` (visible como «Atlenza IA») | RAG sobre apuntes, práctica guiada, modo juego, micro-temporizador único |
| Nutrición | `/nutrition`, `lib/nutrition` | Catálogo, recientes, menús, micros; **sin gasto energético adaptativo** [Probable: `grep` de «tdee/adaptive» sin resultados en `lib/nutrition`] |
| Finanzas | `/finance`, `lib/finance` | Doble entrada, extracto, suscripciones, temporada deportiva, archivar cuentas |
| Clubes y entrenadora | `/clubs`, `/coach`, `lib/clubs`, `lib/coach` | Vínculo 1:1 y membresía de club, ámbitos concedidos por la atleta, art. 18 |
| Transversal | `lib/ai`, `lib/push`, `lib/telegram`, `lib/strava`, `lib/jobs` | IA local primero (`LOCAL_AI_ONLY`), cola pg-boss |
| Operación | `scripts/ops`, `docker-compose.yml`, CI | `doctor.sh`, `update.sh`, imagen en GHCR |

## 3. Producto y benchmark
Las tablas de fuerza/atletismo, estudio/TDAH y finanzas están en `docs/analisis-competencia-feedback.md` § 1; su matriz N/O/C/S sigue vigente. Aquí solo lo nuevo.

### 3.1 Nutrición (nuevo)
| Referente | Patrón | Evidencia | Atlenza hoy | Confianza |
|---|---|---|---|---|
| MacroFactor | Estima el gasto real a partir de lo registrado y la tendencia de peso, y reajusta objetivos cada semana; tarda 2–3 semanas en calibrar | [MacroFactor vs Cronometer](https://macrofactor.com/macrofactor-vs-cronometer/), [reseña](https://calorie-trackers.com/reviews/macrofactor/); casi todas son reseñas de terceros, algunas de competidores | Objetivos fijos; peso y composición ISAK existen pero no cierran el bucle | [Probable] (la fuente es indirecta) |
| Cronometer | Profundidad de micronutrientes; **no** adapta el objetivo, el gasto es una estimación fija | Misma fuente y [foro de Cronometer](https://forums.cronometer.com/discussion/5468/adaptive-tdee-calculation-why-dont-we-have-it) | Atlenza ya tiene micros (`micros.ts`) | [Probable] |

**V3-N01 · Gasto adaptativo (Media-Alta).** Propuesta: tendencia de peso (media móvil) + ingesta registrada → gasto estimado y *borrador* de objetivo semanal que la usuaria acepta (regla «nada escribe sin confirmar»). Riesgos: [Seguro] el peso y la composición corporal son datos de salud y **no pueden ir a la IA**; el cálculo debe ser determinista y local, sin modelo. [Probable] con datos escasos (< 3 semanas) hay que mostrar «aún calibrando», no un número. Cuidado con trastornos alimentarios: sin mensajes de «déficit» agresivo, con topes y enlace a un profesional.

### 3.2 Gestión de clubes (nuevo)
| Referente | Patrón | Evidencia | Atlenza hoy |
|---|---|---|---|
| Spond | Eventos con confirmación de asistencia, recordatorio automático a quien no responde, pagos enlazados al evento, chat y subgrupos, estadísticas de asistencia | [Resumen de funciones](https://help.spond.com/en/articles/28547-spond-features-overview), [cuotas y disponibilidad](https://www.spond.com/news-and-blog/manage-match-fees-and-availability-in-one-app/); pagos con comisión [Probable: cifra de un competidor] | `lib/clubs` con cuotas (`fees.ts`), panel y membresías; sin asistencia a eventos |

**V3-N04 (Media).** Asistencia por evento (sí/no/quizá) con recordatorio push/Telegram a quien no ha respondido y resumen para la entrenadora. **Fuera de alcance por diseño:** cobrar pagos (implica intermediario, normativa financiera y datos de tarjeta); [Probable] basta con registrar «pagada/pendiente». Chat: **no** (superficie de moderación y de datos de menores).

### 3.3 Matriz de propuestas de producto (de § 3.1–3.2 y del análisis previo)
| ID | Propuesta | Impacto | Esfuerzo | Riesgo | Nota |
|---|---|---|---|---|---|
| V3-N01 | Gasto adaptativo (nutrición) | Alto | M | Medio (salud) | Sin IA |
| V3-N02 | «Hoy»: una portada que dice qué hacer ahora (entreno, repasos vencidos, comida pendiente) | Alto | L | Bajo | Une con V3-D01 |
| V3-N03 | Tope diario de repasos y «guardar a flashcards» desde Resumir | Medio | S | Bajo | Ya en la matriz N previa |
| V3-N04 | Asistencia y recordatorios en clubes | Medio | M | Medio (menores) | Sin pagos ni chat |
| V3-N05 | Registro sin red de series y tomas (cola local ya existe en parte) | Medio | M | Medio | Revisar caché privada (V3-S06) |
| V3-N06 | Copia de seguridad/exportación guiada para la usuaria (no solo ops) | Medio | S | Bajo | Refuerza RGPD |

## 4. Navegación, sistema visual, móvil y carga cognitiva
- [Seguro] **Navegación:** `components/layout/nav-items.ts` define 4 grupos y 14 destinos (Entreno, Plan, Salud, Nutrición, Objetivos, Clubes, Mis atletas, Atlenza IA, Finanzas, Ajustes, Privacidad, Notificaciones, Administración, Acerca de) más Inicio. La barra móvil tiene Inicio + 3 + «Más» (`BAR_SLOTS = 3`, líneas 78–79). Orden fijo de la barra: Entreno, Plan, Salud.
- [Probable] **V3-D01 (Alta).** Estudio y Finanzas, dos de las áreas más usadas según el historial de bloques, quedan **detrás de «Más»** en móvil, y la barra prioriza Plan y Salud. La barra debería salir de uso real (`UsageBeacon` ya existe) o ser configurable.
- [Seguro] **V3-D02 (Media).** El destino «Atlenza IA» es `/study`. Nombre de producto de IA y vertical de estudio son cosas distintas; la IA también está en nutrición, plan y coach. Renombrar o separar.
- [Seguro] **Sistema visual:** tokens en `globals.css` (OKLCH, claro/oscuro, `.hc` de alto contraste, `fontScale`); paleta de series validada para daltonismo. Base buena para rediseñar sin reescribir: **conservar los tokens, rehacer composición y jerarquía.**
- [Probable] **V3-D03 (Media): carga cognitiva.** 91 páginas y 271 rutas sugieren muchas pantallas hijas; el análisis previo ya pedía registro en 1–2 toques desde la portada y explicar cada número. Propuesta de principios para el rediseño: (1) una acción principal por pantalla; (2) progresivo: detalle bajo demanda; (3) mismo patrón de «borrador → aceptar» en todo; (4) estados vacíos que enseñan; (5) modo «foco» que oculta módulos no usados (`hiddenModules` ya existe).
- [Seguro] **V3-D04 (Media): flujo a 390 px.** La auditoría v2.3 (`auditoria-ui.md`) encontró controles de 24–40 px en el registrador de fuerza, temporizador y técnica (P2-2…P2-12, algunos «E» = estáticos sin confirmar). [Suponiendo] la mayoría se corrigió en v2.4–v2.6; **no verificado** en este bloque. Reabrir con la comprobación táctil de `e2e`.
- [Seguro] El `error.tsx` global de `(app)` existe (`src/app/(app)/error.tsx`), lo que cierra P1-1 de la auditoría v2.3.

**Entradas para un rediseño completo (no es el diseño):** inventario de componentes (`components/ui` + feature), mapa de tareas de la usuaria frente a destinos, prototipo móvil de «Hoy» y barra configurable, y tests de usabilidad con 3–5 personas reales (no hay ninguno hoy).

## 5. Accesibilidad · WCAG 2.2 AA
Criterios nuevos de 2.2 (nivel AA según el W3C): 2.4.11 foco no oculto, 2.5.8 tamaño de objetivo (24×24 px mínimo), 3.3.8 autenticación accesible; 2.5.7 (arrastre) es AA; 3.3.7 (entrada redundante) es A. Las fuentes secundarias discrepan en niveles: **contrastar con la [novedad oficial del W3C](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) antes de fijar el alcance** ([resumen consultado](https://dequeuniversity.com/resources/wcag-2.2)).

| ID | Criterio / tema | Estado | Confianza |
|---|---|---|---|
| V3-A01 | Cobertura de pruebas: axe solo en 3 suites E2E de ~49 | Hueco: añadir axe a un recorrido por cada vertical y por modo oscuro/`.hc` | [Seguro] (`grep` de «axe» en `e2e`) |
| V3-A02 | 2.5.8 tamaño de objetivo | Muy probable cumplido: 237 usos de `min-h-11` (44 px); 6 botones con `size-6…9` combinados con `onClick` en componentes | [Probable] |
| V3-A03 | 1.4.4 / 1.4.12 texto | Preferencia `fontScale` y 21 usos de `text-[9–11px]` fijos: **no escalan con relación al resto** si el usuario sube la fuente del sistema | [Seguro] el recuento, [Probable] el efecto |
| V3-A04 | 2.3.3 / animaciones | Solo 2 referencias a `prefers-reduced-motion`/`motion-reduce` en todo `src`; el modo juego y los gráficos animan | [Seguro] el recuento |
| V3-A05 | 4.1.3 mensajes de estado | 102 usos de `aria-live`/`role=status|alert`: cobertura buena; falta confirmar que los toasts (`sonner`) se anuncian | [Probable] |
| V3-A06 | 2.4.1 saltar bloques, 2.4.3 orden | «Saltar al contenido» y `main` con `tabIndex=-1` ya existen (`(app)/layout.tsx`) | [Seguro] |
| V3-A07 | 2.4.11 foco no oculto | La barra inferior móvil es fija (`pb-24` reserva espacio): comprobar que el foco por teclado no queda tapado por ella ni por hojas inferiores | [Suponiendo] |
| V3-A08 | 3.3.8 autenticación accesible | Llaves de acceso + contraseña + TOTP/códigos de recuperación: ofrece alternativa a memorizar (llave de acceso) | [Probable] |
| V3-A09 | 2.5.7 movimientos de arrastre | `grep` de `draggable/dnd` en componentes sin resultados: no hay arrastre obligatorio | [Seguro] |
| V3-A10 | Contraste | `--muted-foreground` fijado a ≥ 4,5:1 (v1.8); **no calculados** el resto de pares ni el modo `.hc` | [Probable] / [Suponiendo] |
| V3-A11 | Lector de pantalla real (VoiceOver/TalkBack/NVDA) | Nunca probado por una persona; axe detecta ~⅓ de los fallos | [Probable] |
| V3-A12 | Gráficos | Alternativa textual/tabla de los gráficos (PMC, finanzas): no verificada | [Suponiendo] |

**Alcance propuesto V3-A01:** checklist WCAG 2.2 AA por plantilla de página (no por las 91), axe en CI por vertical, 1 pasada manual con teclado y 1 con lector de pantalla, y una página «Declaración de accesibilidad» en `/legal`.

## 6. Seguridad y privacidad

### 6.1 Superficie de ataque [Seguro]
- **Web:** páginas tras `proxy.ts` (redirige a `/login` sin sesión; públicas: `/login`, `/register`, `/reset`, `/offline`, `/legal`); CSP con nonce por petición y `strict-dynamic`; cabeceras (`nosniff`, `X-Frame-Options: DENY`, HSTS 1 año sin `includeSubDomains`, COOP/CORP `same-origin`) en `next.config.ts`.
- **API:** 271 rutas; cada una se protege en el manejador (`proxy.ts` excluye `/api`); mutaciones comprueban `Origin` contra `AUTH_URL` (`lib/api.ts`) y las condiciones de uso vigentes (`requireUser`).
- **Público sin sesión:** registro (respuesta neutra si el email existe), reto de llave de acceso, informes por token de 32 bytes (hash SHA-256 en BD, formato validado), `csp-report` (8 KB, limitado por IP), `/api/health` (solo «ok/degradado» sin sesión).
- **Datos:** PostgreSQL con pgvector en red de Docker, puerto ligado a `127.0.0.1`; ficheros subidos en un volumen; web de solo lectura, `cap_drop: ALL`, `no-new-privileges`, usuario no root.
- **Egreso:** IA local primero; con `LOCAL_AI_ONLY` nunca otro proveedor; `fetch` a la IA local con `redirect: "error"` y tiempo límite.

### 6.2 Puntos fuertes que no hay que romper en 3.0 [Seguro]
Sesión JWT de 7 días **revalidada contra la BD en cada petición** (`sessionVersion` y suspensión, `auth.ts:196-198`); bloqueo por email+IP y por email global con retraso progresivo y «dispositivo reconocido» firmado; llaves de acceso (WebAuthn) con pruebas del camino feliz y de rechazo; TOTP con paso anti-repetición y códigos de recuperación con hash; AES-256-GCM con rotación de claves (`openAny`); cadena de auditoría (`audit-chain.ts`); aislamiento de ámbitos entrenadora↔atleta con art. 18 bloqueante, ADMIN global sin atajos (`resolveAthleteId`); `isPrivateAddress` y `redirect:"error"` contra SSRF; sniffing de tipo de fichero real (`sniffFile`) y topes de tamaño; caché de service worker acotada por forma de id (v2.11 S2).

### 6.3 Hallazgos
| ID | Sev. | Clase (CWE / OWASP) | Ubicación | Vector (general) | Impacto | Mitigación | Conf. |
|---|---|---|---|---|---|---|---|
| V3-S01 | **Alta** | CWE-308 · A07 Fallos de autenticación | `lib/security/totp.ts`, `auth.ts`; sin regla por rol | Credencial robada o adivinada de una cuenta ADMIN/COACH | Una entrenadora ve datos de salud de sus atletas (con ámbitos); ADMIN gestiona invitaciones y cuentas | Exigir TOTP o llave de acceso a ADMIN y COACH (periodo de gracia con aviso); alta de ADMIN solo con 2FA | [Probable] (no vi ninguna regla; no ejecuté el flujo) |
| V3-S02 | **Media** | CWE-348 · A05 Mala configuración | `lib/rate-limit.ts:75-80` (`clientIp`) | Si la web se expone sin el proxy previsto, la cabecera `X-Forwarded-For` la controla quien llama; sin cabecera, todos caen en el cubo `unknown` | Evasión de límites de tasa y de bloqueo por IP, o bloqueo cruzado de usuarias legítimas | Configurar el nº de proxies de confianza por variable; si no hay cabecera, usar la IP del socket; test con y sin cabecera; `doctor.sh` avisa si `WEB_BIND` ≠ localhost | [Probable] |
| V3-S03 | **Media** | CWE-1357 · A08 Integridad de software | `.github/workflows/*.yml` (acciones por etiqueta `@v4`, 0 por SHA) | Una acción de terceros comprometida ejecuta código en CI con acceso al `GITHUB_TOKEN` y publica la imagen | Imagen de producción alterada | Fijar por SHA completo; Dependabot/Renovate para actualizarlas; el bloque `permissions:` ya existe (línea 13): mantenerlo mínimo | [Seguro] las etiquetas; [Probable] el riesgo |
| V3-S04 | Baja-Media | CWE-918 · A10 SSRF | `lib/ai/provider.ts:90-120` | La comprobación resuelve el nombre y luego `fetch` lo resuelve otra vez (cambio de DNS entre ambas); la lista de rangos no incluye algunos IPv6 de traducción (NAT64, 6to4) ni la forma hexadecimal de IPv4 mapeada | Petición del servidor a una red interna desde una URL de proveedor definida por la usuaria | Resolver una vez y conectar a esa IP (o agente con `lookup` propio); ampliar rangos; con `LOCAL_AI_ONLY` el camino queda cerrado [Seguro] | [Probable] |
| V3-S05 | Baja | CWE-798 · A02 Fallos criptográficos | `lib/auth/login-guard.ts:66-69` | Si `AUTH_SECRET` falta, la firma del dispositivo usa la cadena fija `"dev"`; la validación de entorno exige 32+ caracteres solo en producción con URL pública (`env.ts:110-122`) | Falsificar «dispositivo reconocido» solo salta el retraso y el bloqueo global, no la contraseña | Fallar al arrancar fuera de desarrollo si falta; quitar el valor por defecto | [Seguro] el código, [Probable] el alcance |
| V3-S06 | Baja | CWE-524 / CWE-922 | `public/sw.js`, `components/purge-private-cache.tsx` | Las copias de sesiones y planes y los ficheros compartidos (hasta 30 MB, caché `lifeos-share`) se borran al **cerrar sesión**; si la sesión caduca (7 días) o el dispositivo es compartido, quedan | Lectura local por otra persona del dispositivo | Purgar también al detectar 401, caducar las copias (TTL) y avisar en Privacidad de «dispositivo compartido» | [Probable] |
| V3-S07 | Info | CWE-601 | `public/sw.js` (clic en notificación: `startsWith("/")`) | Una ruta `//otro-sitio` pasa el filtro; el contenido lo manda el servidor, así que exige comprometer el canal push | Redirección abierta | Rechazar `//` y barras invertidas | [Seguro] el código |
| V3-S08 | Media | CWE-639 · A01 Control de acceso | Servicios tras `comments`, `physio/[id]/shares`, vínculos de club | Una cuenta autenticada prueba ids o `athleteId` ajenos | Lectura/escritura entre atletas o entre clubes | Prueba negativa sistemática por ruta (usuaria A contra recursos de B, entrenadora sin ámbito, club ajeno): ya existe `scope-isolation.int.test.ts`, ampliarlo a **todas** las rutas con `[id]` | [Suponiendo] (no auditado el interior) |
| V3-S09 | Media | CWE-770 · A04 Diseño inseguro | 53 de 271 rutas llaman a un límite de tasa | Cuenta autenticada abusiva o script con cookie robada: exportaciones, subidas, generación de PDF | Consumo de CPU/disco/IA; la cola de PDF ya está acotada (v2.11 O17) | Límite por usuaria por defecto en el envoltorio `route()` para mutaciones | [Seguro] el recuento, [Probable] el riesgo |
| V3-S10 | Baja | A05 | `next.config.ts` (`Permissions-Policy`) y CSP `style-src 'unsafe-inline'`, `report-uri` | Micrófono permitido a `self` sin que quede claro su uso (la geolocalización sí se usa: pista y seguridad; la cámara, el escáner); `report-uri` está obsoleto frente a `report-to` | Superficie mayor de la necesaria | Comprobar si el micrófono se usa y retirarlo si no; documentar la deuda de estilos en línea (ya admitida en `csp.ts`) | [Probable] |
| V3-S11 | Info | A06 | `npm audit --omit=dev` | 0 vulnerabilidades el 14/11/2026; `unpdf` pide Node ≥ 24 y el contenedor usa 22 (ya documentado) | — | Calendario de subida de Node y revisión mensual | [Seguro] |
| V3-S12 | Info | — | Operación | Sin copia de seguridad restaurada con regularidad probada en el repo; `check-backups.sh` y `verify-backup.sh` existen | Pérdida de datos | Simulacro de restauración trimestral documentado | [Probable] |

**Cifrado y privacidad (comprobaciones de diseño):** [Seguro] ciclo, salud de la mujer e ISAK pasan por `sealJson`/`dataKey` y las reglas del `CLAUDE.md` los excluyen de IA, entrenadora, informe semanal y `.ics`. [Suponiendo] el aislamiento se mantiene en cualquier función nueva: **añadir una prueba de arquitectura** que falle si un módulo de `lib/ai` importa `lib/health/isak*` o el ciclo (V3-S13, S).
**IA local:** [Seguro] `redirect:"error"`, tiempo límite, sin claves en el cliente. [Probable] la inyección de instrucciones por apuntes subidos está mitigada con `fence` y datos entre delimitadores; **no se ha medido** con un modelo real que intente desobedecer (ya listado como «sin probar»).
**Subidas:** [Seguro] tipo real por contenido, topes (25 MB vídeo, 5 MB imagen con reducción, DOCX con límites y reempaquetado). [Suponiendo] PDF malicioso en `unpdf`/Chromium: depende de la versión; mantener `/tmp` acotado y la cola de PDF (ya hecho).
**Despliegue:** [Seguro] `read_only`, `cap_drop`, `no-new-privileges`, BD solo en localhost. [Probable] la limpieza de `update.sh` sigue sin probar en el servidor real (`estado.md`).

## 7. Propiedad intelectual y avisos

### 7.1 Estado actual [Seguro]
| Lugar | Qué dice hoy |
|---|---|
| `LICENSE` | «Licencia de uso restringido, todos los derechos reservados»: solo ver y hacer *fork* en GitHub; usar, ejecutar, instalar, modificar o desplegar exige permiso escrito (cláusulas 2–3); texto en español prevalece |
| `README.md` líneas 9–14 | Aviso «© 2026 David Ornelas Luna. Todos los derechos reservados… no es open source» |
| `package.json:5` | `"license": "SEE LICENSE IN LICENSE"` |
| `src/app/legal/aviso/page.tsx` | «solo puede usarse con su autorización por escrito» |
| `src/app/legal/condiciones/page.tsx:18` | «Ese permiso es personal: no puedes cederlo…» |
| `components/legal/terms-gate.tsx:21` | Aviso de derechos reservados antes de aceptar |
| Pie de la app autenticada | **No existe** |

### 7.2 Contradicción y decisión (V3-L01) 
El encargo pide un aviso de «proyecto personal para **uso personal y no comercial** bajo derechos de autor». Con la licencia actual, ni siquiera la usuaria-invitada «puede usar» el programa sin permiso; las condiciones de uso resuelven eso con «tu administración te ha invitado». Opciones:
1. **Mantener «todos los derechos reservados»** y añadir un aviso informativo: «Proyecto personal. Uso personal y no comercial. © 2026 David Ornelas Luna». Coherente con lo actual; el aviso describe la intención, la licencia sigue mandando. [Recomendado, mínimo cambio]
2. **Cambiar a una licencia «source-available» no comercial** (p. ej. PolyForm Noncommercial u otra de uso no comercial). Da permiso de uso personal a terceros, pero **permite copiar, modificar y redistribuir** con condiciones: es una cesión mayor y casi irreversible para lo ya publicado. Requiere revisión legal y decidir qué pasa con `THIRD_PARTY_NOTICES.md` (372 dependencias).
3. **Open source real:** descartado por contradecir «no comercial».
Nota: [Probable] una licencia «no comercial» no es «open source» según la OSI; no usar esa palabra. Redacción definitiva y revisión legal **pendientes** (no hecho aquí).

### 7.3 Dónde colocar el aviso (V3-L02)
| Prioridad | Lugar | Forma |
|---|---|---|
| 1 | Pie de `(app)/layout.tsx` y del layout de `(auth)` | Una línea: «© 2026 David Ornelas Luna · proyecto personal, uso personal y no comercial · Aviso legal» (enlace a `/legal/aviso`) |
| 2 | `LICENSE` (cabecera) y `README.md` (banner existente) | Misma frase, sin contradecir las cláusulas |
| 3 | `/legal/aviso`, `/legal/condiciones` y la puerta de condiciones | Sustituir «solo con autorización» por la redacción final tras decidir V3-L01 |
| 4 | `/about` (Acerca de) | Versión, autoría, licencia, terceros |
| 5 | Exportaciones (manual PDF, informe semanal, `.ics`, informe para la médica) | Pie con la autoría, **sin** datos de la instalación |
| 6 | Cabecera en `src/` | No necesaria; con licencia restringida basta `LICENSE` |
| 7 | `package.json` | Mantener `SEE LICENSE IN LICENSE` |
Regla de repo público: el pie no lleva dominio, correo ni nombre de servidor.

## 8. Priorización y entradas para el Bloque B
Esfuerzo S (≤ 1 sesión), M (2–3), L (4+). Orden sugerido de dependencia, no es el roadmap:
| Ola | Contenido | Por qué primero |
|---|---|---|
| 0 · decisiones | V3-L01 (licencia), alcance de 2FA obligatoria, qué verticales se rediseñan | Bloquean el resto; son de la usuaria |
| 1 · seguridad barata | V3-S01, S02, S03, S05, S07, S10; prueba de arquitectura V3-S13; V3-L02 | Alto valor, poco código, sin esquema |
| 2 · fundaciones de diseño | V3-A01 (CI de accesibilidad), V3-D01/D02, tokens y barra configurable, pie de interfaz | Todo rediseño depende de ello |
| 3 · rediseño por vertical | «Hoy», estudio, entreno, nutrición, finanzas, clubes (un bloque cada uno) | Mayor esfuerzo |
| 4 · producto | V3-N01, N03, N04, N05, N06 | Tras ola 3 para no rehacer pantallas |
| 5 · endurecimiento | V3-S04, S06, S08, S09, S12, simulacro de restauración | Pruebas negativas amplias |
**Riesgos de la versión mayor:** (a) [Seguro] migraciones solo aditivas y una por versión: un rediseño que quiera cambiar datos debe respetarlo; (b) [Probable] reescribir pantallas rompe las ~49 suites E2E: reservar presupuesto de pruebas; (c) [Seguro] reglas de ámbito, IA y salud cifrada del `CLAUDE.md` no se negocian en el rediseño.
**Preguntas abiertas para la usuaria (Bloque B):** ¿modelo de licencia 1 o 2? ¿2FA obligatoria para ADMIN/COACH, solo recomendada? ¿se prefiere barra móvil configurable o fija por uso? ¿hay más personas que probarán el rediseño? ¿se abre el uso a otras atletas o sigue siendo solo personal?

## 9. Fuentes externas (consultadas el 14/11/2026, solo páginas públicas)
- MacroFactor: <https://macrofactor.com/macrofactor-vs-cronometer/> · <https://calorie-trackers.com/reviews/macrofactor/> · Cronometer, foro: <https://forums.cronometer.com/discussion/5468/adaptive-tdee-calculation-why-dont-we-have-it> (reseñas de terceros; algunas de competidores).
- Spond: <https://help.spond.com/en/articles/28547-spond-features-overview> · <https://www.spond.com/news-and-blog/manage-match-fees-and-availability-in-one-app/>.
- WCAG 2.2: <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/> (referencia oficial, **no abierta en esta sesión**) · <https://dequeuniversity.com/resources/wcag-2.2> (resumen consultado; los niveles de algunos criterios varían entre fuentes secundarias).
- Fuerza, estudio y finanzas: ver `docs/analisis-competencia-feedback.md` (conocimiento público general, sin URL).
