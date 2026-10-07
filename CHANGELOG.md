# Cambios

Formato: una entrada por versión, lo más reciente arriba. Cómo actualizar el servidor entre versiones: [`manual_docker_debian.md` § 8](manual_docker_debian.md#actualizar-a-una-nueva-versión).

## v1.4 — Crear plan con IA y cerrar el ciclo plan → entreno → control (7/10/2026)

**Astras AI: «Crear mi planificación»**
- Cuestionario guiado **sin escribir nada** (chips, desplegables y fecha): objetivo, disciplina, nivel, días y minutos, dónde entrenas (por día) y con qué material, molestias, ejercicios que evitar, intensidad y estilo.
- **Seguridad previa (estilo PAR-Q):** si marcas dolor en el pecho, mareos, una cardiopatía, embarazo o una cirugía reciente, no se genera el plan y se recomienda una valoración médica.
- Gemini devuelve semanas tipo por fase; la app las convierte en días con fecha, las **valida** (material del sitio, zonas excluidas, minutos, progresión ≤ 10 %, calentamiento y descarga) y reintenta una vez si algo falla.
- **Borrador → vista previa → «Activar en mis entrenamientos»**, con aviso si se solapa con el plan importado. Regenerar o borrar.
- **Ajustes sin escribir:** versión suave del día, «hoy entreno en otro sitio» (cambia los ejercicios por otros compatibles) y «cambiar este ejercicio».
- **Seguimiento semanal** con chips («¿cómo fue?» + dolor) que ajusta la semana siguiente sin llamar a la IA.
- **Mi ciclo** (opcional, solo perfiles de mujer): duración, días de regla, anticonceptivo hormonal y síntomas. Adapta por **síntomas**, no por fases rígidas. **Los datos del ciclo se cifran, nunca se envían a Gemini y la entrenadora no los ve**; se exportan y se pueden borrar con un botón.

**Del plan al entreno**
- **Mis RM**: tabla con historial, importable desde el anexo del plan.
- **%RM → kg** en el plan del día (redondeo configurable, «por mano» en mancuernas, rampas en kg).
- **Registrar desde el plan:** el formulario llega con series, reps y kg.
- **Serie de test → nueva RM** (Epley; solo propone cambiarla si varía ≥ 5 %) y **APRE** 3/6/10.
- **Sesión mixta de verdad** (fuerza + técnica + pista en una sesión).
- **Cumplimiento del plan** por semana y bloque.

**Controles y reglas**
- **Control rápido** en Recuperación: squeeze, talón, salto, % de grasa y codo.
- **Avisos de «Mis reglas»** en Inicio, en la sesión de hoy y en el día del plan: squeeze y talón, codo, tendencia de peso y grasa, VFC con salto o squeeze, **tope de lanzamientos** (1,3 × la media de 4 semanas, 48 h entre sesiones, vuelta a lanzar) y **vídeo contado**. Umbrales editables en **Ajustes → Mis reglas**; ninguno es un dato personal fijo en el código.
- **Rendimiento:** los 3 mejores por implemento y su evolución.

**Competición**
- **Modo competición:** cuenta atrás D−n, checklist de la bolsa y **hoja de intentos 1–6** que se guarda como sesión de competición.
- **Temporada:** marcas en competición con tus líneas de objetivo.
- **Calendario .ics** para Google/Apple Calendar: solo títulos y fechas, enlace secreto y revocable.

**Uso diario**
- **Semana L–D** en Entreno con los lanzamientos frente al tope.
- **Plan de hoy y mañana sin conexión** (para la pista sin cobertura).
- **Recordatorios push:** «mañana toca…», control del lunes y pesarse L-X-V.
- **Búsqueda global** (sesiones, ejercicios, días del plan, tareas y apuntes).
- **Sensaciones al terminar** una sesión (zona, lado, dolor) que alimentan los avisos.

**Nutrición, finanzas y entrenadora**
- **Hidratos según el día** (lanzamientos, gimnasio o descanso).
- **Gastos deportivos** por temporada y competición.
- **Informe para la entrenadora:** enlace de solo lectura que caduca a los 7 días; sin ciclo, peso, VFC ni notas, y molestias solo si lo marcas.

**Arreglado**
- E2E: «ayer» en hora de Madrid (fallaba entre las 22:00 y las 24:00 UTC).

**Técnico**
- Una migración aditiva `v1_4_features` (tablas nuevas y columnas opcionales), probada sobre una copia de una BD v1.3 con datos.
- Variable opcional `DATA_ENCRYPTION_KEY` (si no está, se usa `TOTP_ENCRYPTION_KEY`). `LIFEOS_FAKE_AI=1` solo para la CI y los E2E.
- Rutas públicas con token (`/api/calendar/ics/…`, `/api/report/…`): 32 bytes aleatorios, solo el hash en la BD, límite por IP; `api-auth.test` las lista explícitamente.
- Tests: 310 (unitarios + integración con BD) y un E2E nuevo (`npm run e2e:v14`) en la CI.

## v1.3 — Planificación importada (6/10/2026)

**Nuevo**
- **Importar la planificación desde la app.** Se sube el zip del plan, o sus PDF «día a día», con vista previa antes de confirmar. Se importan:
  - los días;
  - las tablas de ejercicios: series × reps, %RM/carga, RIR, descanso y «Cómo lo hago»;
  - las rampas, el «Por qué», las reglas del bloque y los anexos.
- **Versiones del plan:**
  - A/B (Campeonato de Invierno);
  - el día de competición (sábado o domingo);
  - la rama «Si me clasifico», con fecha de competición.

  Cambiar de versión crea y retira las sesiones planificadas; lo hecho no se toca.
- **Reimportar** una versión nueva del plan: actualiza lo pendiente y deja como están las sesiones ya registradas.
- **Plan del día** legible en el móvil y **página del bloque** (objetivos, semanas, anexos y tabla de RM).
- **«Próximos 7 días»** en Entreno y **«Hoy toca»** en el inicio.
- **Registrar como hecha** cualquier sesión planificada, también las mixtas.
- Ciclos (temporada, bloques y semanas) y competiciones creados solos en el calendario.

**Arreglado**
- Editar una sesión ya no la desvincula de su ciclo.

**Técnico**
- Migración aditiva `v1_3_plan_import`, con las tablas `PlanMeso` y `PlanDay`.
- `fflate` (zip), con límites anti zip bomb.
- Tests con PDF sintéticos, integración con BD y un E2E nuevo (`npm run e2e:plan`) en la CI.
- Documentación: [guía de uso](docs/guia-usuario.md), [arquitectura](docs/arquitectura.md), `SECURITY.md` y `CONTRIBUTING.md`.
- Dependabot ya no propone saltos de versión mayor de TypeScript, ESLint ni `@types/node`: exigen migración.

## v1.2 — 20 mejoras (6/10/2026)

**Seguridad y operación**
- Verificación en dos pasos (TOTP) con códigos de recuperación.
- Registro de actividad y permisos del coach por ámbito.
- Logs para fail2ban, Semgrep, Dependabot y `/api/health` con healthcheck.
- Copias automáticas cifradas con restauración comprobada.
- `scripts/update.sh` con vuelta atrás automática.

**Uso diario**
- Temporizador de descanso, plantillas de sesión, comidas favoritas y gráfica de 1RM.
- Molestias y lesiones; calendario con el detalle del día.
- Notificaciones push.
- Importar del reloj (FIT/GPX/TCX) y extractos bancarios (CSV/Norma 43).
- Ingesta de apuntes en segundo plano.

## v1.1 — Seguridad y privacidad (6/10/2026)

**Seguridad**
- Registro cerrado por defecto, límites de intentos y bloqueo de cuenta.
- CSP con nonce y HSTS.
- Sesiones revocables; cambio de contraseña y de email.

**Privacidad y datos**
- Consentimiento expreso para la IA.
- Exportación y borrado de cuenta; copias cifradas.

**Funciones y operación**
- Editar sesiones, repetir la última de fuerza y recalcular el TSS.
- Tareas programadas y CI.

## v1.0 — Primera versión (5/10/2026)

- **Entrenamiento:** pista, técnica y fuerza, con un motor de carga (TSS, CTL/ATL/TSB, ACWR) y readiness.
- **Planificación:** periodización.
- **Nutrición:** con OpenFoodFacts y escáner de códigos de barras.
- **Finanzas:** de partida doble.
- **Astras AI:** RAG sobre apuntes, flashcards y coach semanal.
- **Plataforma:** PWA instalable; despliegue con Docker en Debian.
