# LifeOS — Guía de uso

Cómo se usa la app día a día, módulo a módulo. Para instalarla en un servidor, ver [`manual_docker_debian.md`](../manual_docker_debian.md); para saber cómo funciona por dentro, [`arquitectura.md`](arquitectura.md) y [`manual_backend.md`](../manual_backend.md).

**Navegación.** En el móvil, la barra inferior tiene **Inicio · Entreno · Plan · Nutrición · Astras AI**. **Recuperación, Finanzas y Ajustes** están en el menú ☰ de arriba a la derecha. En el ordenador, todo está en la barra lateral.

**Instalarla como app.** Ábrela por HTTPS, abre el menú del navegador y elige «Añadir a pantalla de inicio» (Safari: Compartir → Añadir a pantalla de inicio). Las notificaciones en iPhone solo funcionan así.

---

## Primeros pasos

1. **Ajustes → Perfil:** sexo, peso y disciplina.
2. **Ajustes → Umbrales fisiológicos:** FC máxima, FC de reposo, LTHR y ritmo umbral, cada uno con su fecha de inicio. Cada sesión se calcula con los umbrales vigentes ese día, así que actualizarlos no reescribe el pasado.
3. **Ajustes → Objetivo nutricional diario:** kcal y macros.
4. **Ajustes → Verificación en dos pasos:** actívala y guarda los 10 códigos de recuperación en tu gestor de contraseñas.
5. Si quieres, **Planificación → Importar plan** (ver abajo).

## Inicio

- **Readiness:** cómo estás hoy (sueño, VFC, FC en reposo).
- **Forma (PMC):** fitness, fatiga y forma, con ACWR.
- **Hoy toca:** las sesiones del día; las planificadas (○) muestran su duración y te llevan al plan del día.
- **Próxima competición:** días que faltan.
- **Nutrición, finanzas y tareas:** resumen del día.
- **Aviso de lesión:** aparece si tienes una molestia activa y la carga sube.

## Entreno

- **Registrar una sesión** (botón **+ Sesión**):
  - **Fuerza:** busca el ejercicio, «Repetir serie» copia la anterior y arranca el **temporizador de descanso** (vibra y suena al terminar; la pantalla no se apaga mientras corre).
  - **Técnica:** cada intento con su marca, nulo y notas de carrera, bloqueo y suelta.
  - **Pista:** distancia, tiempo, FC e intervalos.
- **Plantillas:** «Guardar como plantilla» en el formulario y, en una sesión nueva, toca la plantilla para precargarla.
- **Importar del reloj:** sube un `.fit`, `.gpx` o `.tcx` (Garmin, Coros, Polar, Suunto, Strava…). Verás una vista previa antes de guardar; si ya estaba importada, te avisa.
- **Próximos 7 días:** las sesiones planificadas que vienen. Debajo, el historial hasta hoy.
- **Rendimiento:** PMC, marcas personales y la gráfica de **1RM estimado** por ejercicio.
- **Editar o borrar** desde el detalle de cada sesión. Al guardar, se recalculan las marcas y la carga.

## Planificación

- **Calendario del mes:** ✓ sesión hecha · ○ planificada · □ tarea que vence. Las barras de color son los ciclos (macro, meso, micro). Toca un día para ver su detalle.
- **+ Añadir:** ciclos de periodización y eventos (competición con prioridad A/B/C, test de 1RM, toma de marca, taper, descarga, examen…).
- **Tareas** con prioridad y fecha.

### Importar tu planificación

Sirve para tener en LifeOS el plan de la temporada que tienes en PDF («M5 · Acumulación II · día a día», etc.).

1. **Planificación → botón de subir (Importar plan)**, arriba a la derecha.
2. Elige el **.zip** del plan, o varios PDF «día a día». Tarda unos segundos en leerlo.
3. **Revisa la vista previa:**
   - días, semanas y ejercicios de cada bloque, y sus competiciones;
   - qué es nuevo, qué cambia y qué no se toca;
   - los avisos (por ejemplo, una semana sin días).

   Los PDF que no son «día a día» (estructura de la temporada, auditoría) se listan como «no se importan»: es lo esperado.
4. **Importar N días.** Cada día de la versión activa pasa a tus entrenamientos como sesión **planificada**, con su tabla de ejercicios. Las competiciones van al calendario y los bloques y semanas aparecen como ciclos.

**Versiones del plan.** Algunos bloques tienen alternativas:

- **M9 y M10:** versión A (vengo del Campeonato de España de Invierno) o B (sin campeonato). Por defecto, B.
- **M12, M13 y M15:** el día en que compites (sábado o domingo).
- **M16:** «Si me clasifico» o el plan normal. «Si me clasifico» cuenta los días hacia atrás desde la competición (D−5…D), así que te pide la fecha.

En la tarjeta **Versiones del plan**, elige la opción y pulsa **Usar esta versión**: se crean las sesiones de esa versión y se retiran las planificadas de la otra. Lo que ya hiciste no se toca. «Ver sus N días» enseña los días de cualquier versión, también de las no activas, para compararlas antes de elegir.

**El plan del día** (desde Hoy toca, el calendario o Entreno):

- los apartados (calentamiento, control, horario…);
- una tarjeta por ejercicio, con series × reps, carga, RIR y descanso a la vista y «Cómo lo hago» desplegable;
- las rampas, en gris (no cuentan);
- «Por qué», plegado.

El nombre del bloque enlaza a **su página**: objetivos, reglas del bloque, semanas y **anexos** (tabla de RM, cálculos, referencias, vídeos).

**Cuando te llegue una versión nueva del plan**, súbela igual. Solo se actualiza lo que sigue pendiente; las sesiones que ya registraste como hechas se quedan como están. Los días que el plan nuevo ya no trae se retiran del calendario.

**Marcar una sesión como hecha:**

1. Abre la sesión planificada y pulsa **Registrar**.
2. Elige la pestaña (fuerza, técnica o pista) y anota lo que hiciste.
3. Desmarca «Guardar como planificada» y guarda.

El plan del día y el microciclo siguen enlazados a la sesión. En los días mixtos (gimnasio + jabalina), anota la parte principal y pon el resto en notas: de momento el formulario registra un tipo por sesión.

**Privacidad:** los PDF no se guardan en el servidor; se leen y se descartan, y solo se queda el plan ordenado. Entra en «Descargar mis datos» y se borra con la cuenta. **No subas tus PDF al repositorio de GitHub** (es público).

## Recuperación

- **Registro diario:** horas y calidad de sueño, VFC (rMSSD), FC en reposo, dolor muscular, estrés y ánimo. Con eso se calcula el **readiness** (0–100).
- **Molestias y lesiones:** zona, lado, intensidad y fecha. Mientras haya una activa, el panel avisa si la carga sube.

## Nutrición

- **Buscar alimentos** (OpenFoodFacts) o **escanear el código de barras** con la cámara.
- **Comidas favoritas** y **repetir una comida de ayer** con un toque.
- El objetivo del día se ajusta si es día de entreno (también cuenta una sesión planificada).

## Finanzas

- **Cuentas y movimientos:** gasto e ingreso simples, o un movimiento repartido en varias líneas. La contabilidad es de partida doble: el saldo siempre cuadra.
- **Presupuestos** por categoría, con aviso al acercarte o pasarte.
- **Suscripciones:** cobros periódicos que se contabilizan solos.
- **Importar extractos:** CSV de tu banco (eliges columnas una vez y guardas el formato) o Norma 43. Si reimportas un extracto solapado, no se duplican movimientos.
- **Flujo de caja** y gasto por categoría.

## Astras AI (estudio)

Requiere activarla en **Ajustes → Privacidad e IA**: está desactivada hasta que la autorizas, porque envía texto a Google Gemini.

- **Apuntes:** sube PDF, TXT o Markdown. Se procesan en segundo plano y, si fallan, puedes reintentar.
- **Chat:** preguntas sobre tus apuntes, con las fuentes citadas.
- **Flashcards:** se generan desde un documento y se repasan con repetición espaciada.
- **Coach semanal:** un informe de tu semana de entrenamiento. Tus lesiones no se envían a la IA.

## Ajustes

- **Seguridad:**
  - cambiar la contraseña o el email (cierra las demás sesiones);
  - «Cerrar sesión en todos los dispositivos».
- **Verificación en dos pasos:**
  - app de autenticación + 10 códigos de recuperación de un solo uso;
  - si pierdes el móvil y los códigos, el administrador puede desactivarla desde el servidor.
- **Notificaciones:** resumen diario, informe semanal del coach y **aviso de inicio de sesión nuevo**.
- **Actividad reciente:** inicios de sesión, cambios de contraseña, 2FA… (se guarda 180 días).
- **Entrenador / atletas:** invita a tu entrenador y elige qué puede ver (carga, sesiones, recuperación, planificación, informes) y si puede planificarte.
- **Tus datos:** descargar todo en JSON, CSV de entrenos y finanzas, y **borrar la cuenta** (definitivo).
