# Cambios

Formato: una entrada por versión, lo más reciente arriba. Cómo actualizar el servidor entre versiones: [`manual_docker_debian.md` § 8](manual_docker_debian.md#actualizar-a-una-nueva-versión).

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
