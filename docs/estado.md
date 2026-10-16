# Estado del proyecto (traspaso entre sesiones)

> Fichero corto que cada sesión nueva lee primero. Al terminar un bloque, actualízalo (≤ 80 líneas).

## Dónde estamos
- **Versión:** **v2.2.0 lista para producción**, pendiente de fusionar el PR de release (16/10/2026). v2.0 y v2.1 fusionadas. Estabilidad: ver «Cierre v2.2».
- **Método:** por bloques, **una sesión por bloque**; cierre de versión con PR al final. La usuaria fusiona; Claude nunca.
- **Bloque en curso:** ninguno. Hechos v2.3 **B1–B4** (navegación, Entrenamiento/Tests/Métricas, Clubes/coach/fisio, Ajustes + auditoría táctil final). Auditoría UI: `docs/auditoria-ui.md`. Siguiente: **cierre de versión v2.3.0** (versión, CHANGELOG, guía, manual «De v2.2 a v2.3», `test-migration.sh` no aplica: sin migración, Semgrep, licencias, PR de release).
- **Pendiente manual (no es código):** probar el medidor de salto con HEVC/.mov real en un iPhone (P3-4): grabar en cámara lenta y en normal,
  subirlo en `/training/tests/salto`, comprobar fps detectados y altura creíble (~30–60 cm en un CMJ). **No está probado.**

## Cierre v2.2 (16/10/2026) — todo en verde
- `typecheck` y `lint` OK · `npm run test`: **151 ficheros, 877 tests** OK · `e2e.sh all`: **21 suites** OK (incluye v22a, v22b y security).
- `test-migration.sh` OK: `v2_2_features` aplica sobre la foto previa + 120 sesiones sintéticas; recuentos y huellas idénticos; `migrate diff` vacío.
- Semgrep: 6 reglas, 872 ficheros, **0 hallazgos** · licencias: 347 dependencias de producción admitidas · `npm audit --omit=dev`: **0 vulnerabilidades**.
- Sin cambios de código en el cierre: solo versión 2.2.0, CHANGELOG, guía, manual «De v2.1 a v2.2», README y este fichero. `docs/propuesta-v2-2.md`: P1, P2 y P3 resueltos (P3-4 a mano).
- **Trampas de entorno al cerrar:** (1) un comando que contenga el texto `next-server` (p. ej. `pgrep -f next-server` lanzado por Claude) hace que `e2e.sh` crea que
  hay servidor y no lo arranque → todas fallan con `ERR_CONNECTION_REFUSED`; (2) `e2e` y `e2e:security` necesitan VAPID en `.env.local` (no versionado; `session-start.sh` no las genera:
  `npx web-push generate-vapid-keys`); (3) `snapshot.sh --before 20270301080000_v2_2_features` antes de `test-migration.sh` en un contenedor nuevo (falta `/tmp/atlenza-before.dump`).

## Qué contiene v2.2 (detalle en CHANGELOG y código)
- **P1 · privacidad e integridad.** Migración `20270301080000_v2_2_features` (`WatchAlert`, `ApiMetricMinute`; solo tablas). Strava filtrado en toda vista de la entrenadora
  (helpers en `strava/policy.ts`; `coach/overview.ts`, hilo, `records`, informe compartido, `multi-plan`; `pmc` devuelve `loadHidden`). Test transversal `strava/privacy.int.test.ts`:
  **toda ruta nueva que lea sesiones de otra persona debe entrar ahí**. Métricas por réplica con `flushMetrics`; `metricsSummary` es async. Restaurar recupera `AthleteProfile`.
  `test-migration.sh` carga `scripts/dev/synthetic-data.sql` (ajustarlo si cambian columnas obligatorias). `/admin` exige 2FA: el E2E mira las métricas en BD.
- **P2 · pista, reglas, móvil.** Sin migración. PR `TRACK_TIME` (`disciplines.ts#bestTimesByDistance`, solo series manuales), temporadas con tiempos, reglas `fast-cap`/`km-ramp`/`jump-cap`
  (umbrales en prefs, **siempre sin Strava**), plan IA con la prueba, bienvenida con «Mi prueba». Móvil: `overflow-x-auto`, rejillas 2→4, 44 px bajo `md`. `weather.ts` sigue en memoria (aceptado).
  `/coach/multi` lanza error de servidor a una atleta (solo entrenadoras): fuera del barrido E2E.
- **P3.** Medido el JS de cliente (nada alarmante; sin TTFB). Borrar ejercicios propios (409 con series). Aviso al compartir protocolo de fisio (`notifyOnce`, texto genérico).
  Auditoría de club con `COACH_SCOPES_CHANGED` (sin enum nuevo). Tira semanal táctil.

## v2.3 · B1 navegación global (16/10/2026)
- `layout/nav-items.ts`: `NAV_GROUPS` (Entrenamiento y salud · Clubes y coach · Herramientas · Configuración), `buildNav({hidden, role})`, `activeHref` (prefijo más largo), `moreActive`. Sin migración ni lectura de datos: solo enlaces.
- Móvil: barra inferior de 5 huecos ≥ 44 px (Inicio + 3 destinos que rellenan si se ocultan módulos + «Más» con el sheet agrupado); se quitó la hamburguesa. Desktop: sidebar con los mismos grupos.
- `/coach` («Mis atletas», solo COACH/ADMIN), `/admin` (solo ADMIN), Privacidad y Notificaciones ya salen en el menú. La visibilidad real sigue protegida en cada página.
- Tests: `layout/nav-items.test.ts`, `admin/ops.test.ts`; E2E `e2e:v23a` (390 px claro/oscuro, atleta/entrenadora, ≤ 2 toques, sin scroll horizontal, sidebar a 1280) + `e2e:v22b` en verde. Añadida a `e2e.sh all`.
- Verificado: typecheck, lint, vitest de lo tocado. No se corrió `e2e.sh all` (cierre de versión).

## v2.3 · B2 Entrenamiento, Tests y Métricas (16/10/2026)
- `lib/training/hub-links.ts` (lógica pura): `trainingHubSections(family)` (jabalina solo si lanza), `TESTS_TABS`/`testsTabActive`, `performanceSectionOrder(family)`. Test: `hub-links.test.ts`.
- `/training`: cabecera solo con «+ Sesión»; Semana → Próximos 7 días → **Accesos** (`training-shortcuts.tsx`, «Medir y analizar» a la vista, «Planificar y biblioteca» plegado) → Marcas → Historial.
- Tests: pestañas `tests-nav.tsx` (Resultados · Medir salto · Comparar · Curvas) en las 4 rutas; en móvil los resultados van antes que el formulario. `/training/performance`: rango, chips e índice de secciones (`#carga #fuerza #lanzamientos #temporada`) ≥ 44 px; lo de su prueba primero.
- Controles < 44 px corregidos (auditoría P2-2…P2-12 en el módulo, `summary` de los desplegables). Sin migración ni cambios de API/privacidad (solo se lee disciplina/prueba del perfil propio).
- E2E `e2e:v23b` (claro/oscuro, sesión y tests sembrados, **error** si un control < 44 px o hay scroll horizontal) en `e2e.sh all`; ajustados `salto` y `v21c` por los nombres de enlace. En verde: v23b, salto, v21c, v22a, v22b, v23a. Tras `npm run build` hay que reiniciar el servidor (`serve.sh true`) o todas las E2E fallan en el login.

## v2.3 · B3 Clubes, entrenadoras y protocolos (16/10/2026)
- `lib/clubs/club-layout.ts` (puro): `clubSections` (staff: alertas → cumplimiento → calendario → miembros → cuotas; atleta: solo cuotas) y `coachHubLinks` (la atleta nunca ve «Mis atletas»; «Planificar varios» solo si algún vínculo tiene `canPlan`). Test: `club-layout.test.ts`.
- `/clubs`: invitaciones → mis clubes → **Accesos** → **Mis entrenadoras** (solo vínculos propios, enlaza a `/settings#entrenadora`; `CoachLinks` sigue en Ajustes) → «Crear un club» plegado. `/clubs/[id]`: índice de secciones ≥ 44 px, cumplimiento en lista en móvil (tabla desde `md`), invitar y apuntar cuota plegados.
- `/coach`: accesos arriba, tarjetas por atleta con resumen (carga/cumplimiento/marca) en móvil, tabla solo desde `md`, «Comentar en bloque» al final (`#comentar`). `/recovery/fisio`: la entrenadora ve Mis protocolos → «+ Nuevo protocolo» plegado → Compartidos; estado vacío.
- Privacidad: sin lecturas nuevas de datos ajenos. `strava/privacy.int.test.ts` cubre ya `loadClubPanel` y `previewAssignment` (objetivo 1 de v2.3 cerrado).
- E2E `e2e:v23c` (claro/oscuro, error si scroll horizontal o control < 44 px) en `e2e.sh all`; ajustadas v16, v20a y v21c por tabla/formularios plegados. En verde: v23c, v15, v16, v20a, v20b, v21c, v22a, v22b, v23a, v23b. La sesión de Strava no se siembra en E2E (cubierta en el test de integración).

## v2.3 · B4 Ajustes y auditoría táctil final (16/10/2026)
- `lib/settings/sections.ts` (puro): `SETTINGS_GROUPS`/`settingsGroups(role)` — Perfil y entreno · Entrenadora · Avisos y app · Conexiones e IA · Cuenta y seguridad · Tus datos · Administración (solo ADMIN). `/settings` se reordena por grupos con `<h2>` e índice de chips ≥ 44 px (`nav` «Secciones de Ajustes»); mismas secciones y consultas; anclas viejas (`#entrenadora`, `#mis-reglas`, `#pista`…) intactas y ids nuevos en todas. Test: `sections.test.ts`.
- P2-1 («Mi pista» → `<Input>`), P1-1 (`components/route-error.tsx` + `(app)/error.tsx`; `settings/error.tsx` lo reutiliza). P3-4/P2-13: etiquetas de casillas, `summary` y enlaces de acceso con `min-h-11` en Inicio, `/glance`, `/goals`, `/recovery`, `/study`, `/planning`, `/training/new`, `/training/rm`, `/safety`, Ajustes.
- E2E `e2e:v23d` (claro/oscuro, atleta y ADMIN): Ajustes por grupos + barrido de 55 rutas estáticas; **error** si scroll horizontal o control < 44 px (casillas = su `label`; se exime el enlace dentro de un texto, WCAG 2.5.8). En `e2e.sh all`.
- Trampa: tras `npm run build` hay que reiniciar con `serve.sh true`; si no, el login falla o se mide la versión vieja (el barrido salió «verde» con el servidor viejo).
- Verificado: typecheck, lint, `npm run test` (155 ficheros, 898 tests), las 25 suites E2E en verde, Semgrep 0 hallazgos (883 ficheros), licencias OK. Si `e2e.sh all` falla todo en el login: reconstruye y reinicia (`serve.sh true`) y lanza la lista sin `all`.
- Sin migración ni cambios de privacidad (solo JSX/clases). Pendiente de v2.3.0: P3-1…P3-3 (tablas/rejillas con datos) quedan como riesgo estático sin reproducir.

## Objetivos tentativos v2.3 (nada comprometido; elegir con la usuaria)
1. (hecho en B3) `loadClubPanel` y `previewAssignment` ya están en `strava/privacy.int.test.ts`.
2. Más reglas por familia (P2-4 quedó en 3): combinadas, vídeo de saltos.
3. Medir TTFB a 390 px antes de optimizar consultas (P2-7/P3-1 sin cifra).
4. Los 3 controles < 44 px de `/settings` (son los `<input>` de «Mi pista» en `carbs-form.tsx:124-131`, ver auditoría P2-1) y auditar cambios de rol del staff del club.
   Auditoría UI: ~13 controles táctiles < 44 px **por análisis estático** (loggers) y falta `error.tsx` fuera de Ajustes (P1-1); medir con sesión rellena antes de arreglar.
5. Resultado del P3-4 en iPhone; si el HEVC no carga, decidir entre guía o conversión local.
6. Perfil F-V (Samozino) y detección automática de despegue en el salto (fuera desde el bloque Salto).

## Histórico resumido (v2.0 y v2.1)
- **/settings «This page couldn't load»:** causa NO reproducida; endurecido con `settings/error.tsx` (recarga si es `ChunkLoadError`; en producción probar Ctrl+F5), `lib/settings/optional.ts` y `shortWhen`.
- **Salto:** `training/jump.ts` (fórmulas puras), API `api/training/tests/jump` (recalcula en servidor), UI `jump-meter.tsx`, guía `jump-guide.tsx`, E2E `e2e:salto`. El vídeo nunca sale del navegador.
  `effectiveFps` usa los fps **del fichero** salvo tramo de cámara lenta; `videoWarnings` avisa de conversiones de iOS.
- **v2.0:** A clubes y cuotas (`src/lib/clubs/`; pertenecer no da acceso, la atleta elige `scopes`/`canPlan`; `processingRestrictedAt` bloquea siempre) · B varias atletas y «qué pasa si»
  (sin escrituras; un borrador por atleta) · C flashcards compartidas (`FlashcardReview`; SQL de datos en `prisma/data-migrations/<migración>.sql`, que `regen-mig.sh` añade al final) ·
  D VFC del PDF y tendencias (umbrales en prefs, nada a la IA) · E varias réplicas (`withJobLock`, límite de peticiones en Postgres con HMAC).
- **v2.1:** 1 disciplinas (`primaryEvent`, `training/disciplines.ts`, E2E v21a) · 2 ejercicios con vídeo propio (`files/sealed-files.ts`, solo MP4/WebM por firma, AES-GCM de fichero entero,
  catálogo global sin vídeo, entrenadora solo consulta; E2E v21b) · 3 curvas de referencia citadas (catálogo **vacío** a propósito, sin extrapolar, nada a la IA) y protocolos de fisio compartidos
  (solo cuenta COACH, vínculo + ámbito RECOVERY, quitar acceso borra el seguimiento; E2E v21c). `snapshot.sh --before` borra tablas, tipos y columnas de la migración para regenerarla entera.
  Restaurar conserva `discipline` de las sesiones; vídeos y lo compartido no se restauran.

## Decisiones tomadas
- LEAF-Q: cribado propio (`health/women.ts`); opcional cargar el texto oficial desde un fichero local fuera del repo si algún día hay permiso. QuickDASH/VISA-A ya son escalas propias.
- Sin app Android ni iOS (sigue la PWA). Sin Stripe ni pagos. Sin email (Telegram + push).
- BEDCA fuera por licencia. Strava y la salud cifrada fuera de la IA, de la entrenadora y del `.ics`.

## Pendientes de la usuaria (no de código)
- Inscribir Atlenza en el Registro de la Propiedad Intelectual. Revisión de `LICENSE` por un abogado.
- Probar HEVC/.mov en su iPhone (P3-4).
