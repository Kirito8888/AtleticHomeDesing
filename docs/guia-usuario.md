# LifeOS — Guía de uso

Cómo se usa la app día a día, módulo a módulo. Para instalarla en un servidor, ver [`manual_docker_debian.md`](../manual_docker_debian.md); para saber cómo funciona por dentro, [`arquitectura.md`](arquitectura.md) y [`manual_backend.md`](../manual_backend.md).

**Navegación.** En el móvil, la barra inferior tiene **Inicio · Entreno · Plan · Nutrición · Astras AI**. **Recuperación, Finanzas y Ajustes** están en el menú ☰ de arriba a la derecha, y la lupa 🔍 abre la **búsqueda** (sesiones, ejercicios, días del plan, tareas y apuntes). En el ordenador, todo está en la barra lateral.

**Instalarla como app.** Ábrela por HTTPS, abre el menú del navegador y elige «Añadir a pantalla de inicio» (Safari: Compartir → Añadir a pantalla de inicio). Las notificaciones en iPhone solo funcionan así.

---

## Primeros pasos

1. **Ajustes → Perfil:** sexo, peso y disciplina.
2. **Ajustes → Umbrales fisiológicos:** FC máxima, FC de reposo, LTHR y ritmo umbral, cada uno con su fecha de inicio. Cada sesión se calcula con los umbrales vigentes ese día, así que actualizarlos no reescribe el pasado.
3. **Ajustes → Objetivo nutricional diario:** kcal y macros.
4. **Ajustes → Verificación en dos pasos:** actívala y guarda los 10 códigos de recuperación en tu gestor de contraseñas.
5. Si quieres, **Planificación → Importar plan** (ver abajo), o **Astras AI → Crear plan** si no tienes uno.
6. **Ajustes → Mis reglas:** revisa los umbrales de los avisos (vienen con valores genéricos).

## Inicio

- **Readiness:** cómo estás hoy (sueño, VFC, FC en reposo).
- **Forma (PMC):** fitness, fatiga y forma, con ACWR.
- **Hoy toca:** las sesiones del día; las planificadas (○) muestran su duración y te llevan al plan del día.
- **Próxima competición:** días que faltan.
- **Nutrición, finanzas y tareas:** resumen del día.
- **Aviso de lesión:** aparece si tienes una molestia activa y la carga sube.
- **Avisos de «Mis reglas»** (en ámbar): squeeze o talón por encima del umbral, codo, peso, VFC, tope de lanzamientos, vídeo contado y molestias anotadas al terminar una sesión. Son **pautas de prudencia, no diagnósticos**; «Ajustar mis reglas» lleva a los umbrales.
- **Versión suave:** si usas «Mi ciclo» y hoy marcaste síntomas (o es un día previsto con síntomas), te propone la versión suave de la sesión.
- La próxima competición enlaza al **modo competición**.
- **Hábitos:** marca cada hábito del día con un toque (🔥 = racha). «Editar hábitos» para añadir o archivar.
- **Avisos de salud** (si usas «Salud de la mujer») y **avisos de material** cuando toca reponer algo.
- **Estudio:** el próximo examen y si algún entreno cae ese día o la víspera.

## Entreno

- **Registrar una sesión** (botón **+ Sesión**):
  - **Fuerza:** busca el ejercicio, «Repetir serie» copia la anterior y arranca el **temporizador de descanso** (vibra y suena al terminar; la pantalla no se apaga mientras corre).
  - **Técnica:** cada intento con su marca, nulo y notas de carrera, bloqueo y suelta. En lanzamientos, **Vídeo contado**: de los revisados, cuántos con el codo estirado y con la cabeza estable.
  - **Pista:** distancia, tiempo, FC e intervalos.
- **Sesión mixta:** activa «Sesión mixta» y rellena cada pestaña (fuerza, técnica, pista): se guarda todo en una sesión.
- **Sensaciones al terminar:** «+ Añadir una molestia» → zona, lado y dolor (1–10). Si pasa de tu umbral, avisa en Inicio. La entrenadora no las ve.
- **Plantillas:** «Guardar como plantilla» en el formulario y, en una sesión nueva, toca la plantilla para precargarla.
- **Importar del reloj:** sube un `.fit`, `.gpx` o `.tcx` (Garmin, Coros, Polar, Suunto, Strava…). Verás una vista previa antes de guardar; si ya estaba importada, te avisa.
- **Semana L–D** (arriba): ✓ hecho · • pendiente · ! sin registrar · – saltado, y los lanzamientos de la semana frente a tu tope.
- **Próximos 7 días:** las sesiones planificadas que vienen. Debajo, el historial hasta hoy.
- **Mis RM:** tu tabla de RM con historial. «Importar del plan» lee el anexo de RM del plan importado. La **serie de test** calcula la RM nueva (carga × (1 + reps/30)) y solo propone cambiarla si varía más que tu umbral (5 % por defecto). **APRE** (3/6/10) te dice cuánto subir o bajar según las repeticiones de la serie 3.
- **Rendimiento:** PMC, **los 3 mejores por implemento** con su evolución, **marcas en competición con tus objetivos de temporada** (añádelos ahí mismo: «Mínima 55 m»…) y el **1RM estimado** por ejercicio.
- **Editar o borrar** desde el detalle de cada sesión. Al guardar, se recalculan las marcas y la carga.
- **Dictar la sesión** (en «+ Sesión», con la IA activada): di «sentadilla 3 por 5 a 90, RIR 2» y se rellena el formulario para que lo revises antes de guardar. El audio no sale del móvil; solo el texto.
- **Mover o duplicar** una sesión planificada desde su detalle: avisa si deja dos sesiones de lanzamiento demasiado juntas.
- **Planificado frente a hecho:** en una sesión que viene del plan, series, reps, kg y tonelaje pedidos frente a lo registrado.
- **VBT:** apunta la velocidad media (m/s) de cada serie; en «Mis RM» verás el perfil carga-velocidad y la RM estimada, y en la sesión, la pérdida de velocidad.
- **Técnica:** cada sesión muestra la consistencia (media, mejor, variación y % de nulos) y la dispersión de intentos; si pusiste tu pista en Ajustes, también el tiempo que hacía.
- **Tests físicos** (botón del cronómetro): 30 m, saltos, balón medicinal… o los tuyos, con mejor marca y gráfica.
- **Material** (botón de la caja): jabalinas, clavos y zapatillas con vida útil (usos o meses). Las jabalinas cuentan solas los lanzamientos registrados con su peso desde la compra; «+usos» para los que no apuntaste. Al 80 % te avisa y al 100 % pide reponer.

## Planificación

- **Calendario del mes:** ✓ sesión hecha · ○ planificada · □ tarea que vence. Las barras de color son los ciclos (macro, meso, micro). Toca un día para ver su detalle.
- **+ Añadir:** ciclos de periodización y eventos (competición con prioridad A/B/C, test de 1RM, toma de marca, taper, descarga, examen…).
- **Tareas** con prioridad y fecha.
- **✎ examen** en el calendario y, al tocar el día, sus clases y exámenes.
- **Plan propio** («hazlo tú», debajo del calendario): nombre, inicio, semanas y días de la semana; luego edita cada día (título, duración y tabla de ejercicios), **duplica la semana** y **actívalo** como el plan con IA.
- **Versión para imprimir** en cada día del plan: tabla con los kg, para llevarla a la pista o guardarla en PDF.

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

El formulario llega **precargado desde el plan**: series, reps y kg calculados desde el %RM con tu tabla de RM. Si un ejercicio del plan no está en el catálogo, te avisa: elígelo una vez y se recuerda. En los días mixtos (gimnasio + jabalina), activa **Sesión mixta**.

**Los kg en el plan.** Con tu tabla de RM, cada carga en %RM muestra los kg (p. ej. «83 % · 95 kg»), redondeados al escalón de Mis reglas (2,5 kg por defecto) y «por mano» en mancuernas. La página del bloque muestra el **cumplimiento** por semana.

### Modo competición

En el calendario o en Inicio, toca una competición:

- **Cuenta atrás** (D−3, Día D…).
- **La bolsa:** checklist (la lista se edita y vale para todas las competiciones; lo marcado se queda en ese móvil).
- **Calentamiento cronometrado:** pon la hora de la prueba y cuenta hacia atrás bloque a bloque (movilidad, carrera, lanzamientos…), con vibración al cambiar. Los bloques se editan ahí mismo.
- **Hoja de intentos** (el día de la competición): marca, nulo y viento de los 6 intentos. «Guardar la competición» la registra como sesión técnica de competición, con su mejor marca.

### Calendario en el móvil (.ics)

**Ajustes → Calendario en el móvil → Crear enlace.** Pégalo en Google Calendar (en el ordenador: Otros calendarios → + → Desde URL) o ábrelo en el iPhone. Solo lleva títulos y fechas de tus sesiones y eventos: ni notas, ni marcas, ni datos de salud. Quien tenga el enlace ve esos títulos, así que no lo compartas; «Revocar» lo apaga y «Crear un enlace nuevo» invalida el anterior.

**Privacidad:** los PDF no se guardan en el servidor; se leen y se descartan, y solo se queda el plan ordenado. Entra en «Descargar mis datos» y se borra con la cuenta. **No subas tus PDF al repositorio de GitHub** (es público).

## Recuperación

- **Registro diario:** horas y calidad de sueño, VFC (rMSSD), FC en reposo, dolor muscular, estrés y ánimo. Con eso se calcula el **readiness** (0–100).
- **Control rápido** (desplegable): test squeeze y talón (0–10), salto en la pared (cm), % de grasa de la báscula y si notas el codo al lanzar. Hazlo el lunes (o el día que te toque): alimenta los avisos.
- **Molestias y lesiones:** zona, lado, intensidad y fecha. Mientras haya una activa, el panel avisa si la carga sube.
- **Mi ciclo** (solo si tu perfil es de mujer, y opcional): marca la regla y los síntomas del día con un toque, y en «Configurar» (luego «Mis ajustes del ciclo») la duración media, los días de regla y si usas anticonceptivo hormonal (entonces no se estiman fases, solo cuentan los síntomas). Con eso la app propone la **versión suave** los días con síntomas. Los datos se guardan **cifrados**, **no se envían a la IA** y **tu entrenadora no los ve**; «Borrar mis datos del ciclo» los elimina.
- **Bienestar y carga:** índice tipo Hooper (sueño, estrés, fatiga y agujetas), monotonía y strain de Foster y deuda de sueño de la semana, con aviso según tus umbrales.
- **Importar VFC y sueño (CSV):** de HRV4Training, Elite HRV, Garmin… Eliges las columnas una vez y se guarda el formato.
- **Vuelta tras lesión por fases:** en cada molestia, «Vuelta por fases» con fases y criterios (dolor máximo, checklist, test). Mientras dura, no salen los avisos de carga que no tocan.
- **Salud de la mujer** (botón en Recuperación; si tu perfil es de mujer o lo activas):
  - **disponibilidad energética** de la semana (necesita que registres comida y peso; si faltan datos, lo dice);
  - **cribado de RED-S** (8 preguntas, cada 3 meses): orientativo, no es un diagnóstico;
  - **regla ausente o irregular** según «Mi ciclo»;
  - **analíticas** (ferritina, hemoglobina, vitamina D…) con su tendencia y recordatorio;
  - **suelo pélvico:** anota síntomas con un toque; propone reducir impactos y una rutina;
  - **embarazo y posparto:** modo que bloquea el plan con IA y guía la vuelta por fases (con el alta de tu médica o matrona).
  Igual que «Mi ciclo»: **cifrado, nunca va a la IA y tu entrenadora no lo ve**. Cada aviso recomienda consultarlo con un profesional. «Borrar mis datos de esta sección» lo elimina.

## Nutrición

- **Buscar alimentos** (OpenFoodFacts) o **escanear el código de barras** con la cámara.
- **Comidas favoritas** y **repetir una comida de ayer** con un toque.
- El objetivo del día se ajusta si es día de entreno (también cuenta una sesión planificada).
- **Hidratos según el día:** en **Ajustes → Objetivo nutricional**, pon los gramos de hidratos para día de lanzamientos, de gimnasio y sin entreno (los de tu plantilla). El día muestra cuál aplica.
- **Agua:** vasos con un toque; el objetivo sube los días con sesión y con calor (Ajustes → Agua).

## Finanzas

- **Cuentas y movimientos:** gasto e ingreso simples, o un movimiento repartido en varias líneas. La contabilidad es de partida doble: el saldo siempre cuadra.
- **Presupuestos** por categoría, con aviso al acercarte o pasarte.
- **Suscripciones:** cobros periódicos que se contabilizan solos.
- **Importar extractos:** CSV de tu banco (eliges columnas una vez y guardas el formato) o Norma 43. Si reimportas un extracto solapado, no se duplican movimientos.
- **Flujo de caja** y gasto por categoría.
- **Gastos deportivos:** al crear un gasto, activa «Gasto deportivo» y, si quieres, elige la competición; o toca 🏅 en un movimiento ya guardado. La tarjeta los suma por temporada y por competición.
- **Becas y saldo de la temporada:** activa «Ingreso deportivo» en una beca, premio o patrocinio (o 🏅 en el movimiento). La tarjeta muestra ingresos frente a gastos deportivos, el saldo y la previsión a fin de año al ritmo actual.

## Astras AI: crear tu planificación

**Astras AI → Crear plan.** Requiere la IA activada (Ajustes → Privacidad e IA) y la clave de Gemini en el servidor.

1. **Cuestionario sin escribir:** objetivo, disciplina, nivel, edad, qué días y cuántos minutos, duración (4–12 semanas) y fecha de inicio, **dónde entrenas cada día** y **con qué material**, molestias y ejercicios que prefieres evitar, intensidad y estilo.
2. **Seguridad:** si marcas dolor en el pecho, mareos, una condición cardíaca, embarazo o posparto reciente, o una cirugía en los últimos 6 meses, **no se genera el plan**: consulta antes con un profesional sanitario.
3. **Mi ciclo** (si tu perfil es de mujer): opcional, se puede saltar. Ver Recuperación.
4. **Genera** → queda como **borrador**: revisa semanas, días y ejercicios. Si se solapa con tu plan importado, te avisa.
5. **Activar en mis entrenamientos** crea las sesiones planificadas. Hasta entonces no toca tu calendario.

En cada día del plan:

- **Versión suave:** menos volumen y sin impactos, con un toque.
- **Ajustar este día:** «hoy entreno en casa / en el parque…» cambia los ejercicios por otros que encajan con el material de ese sitio.
- **Cambiar un ejercicio** (dentro de «Ajustar este día»): eliges entre alternativas.

Al terminar cada semana, **«¿Cómo fue?»** (fácil / bien / duro + dolor) ajusta la semana siguiente (±1 serie, ±1 RIR) sin volver a llamar a la IA.

Lo que se envía a Gemini: solo tus respuestas del cuestionario (incluidas las zonas con molestias que marques; las lesiones activas vienen marcadas y puedes quitarlas). Nunca tu ciclo, tus registros de recuperación, tus notas ni tu nombre.

## Astras AI (estudio)

Requiere activarla en **Ajustes → Privacidad e IA**: está desactivada hasta que la autorizas, porque envía texto a Google Gemini.

- **Apuntes:** sube PDF, TXT o Markdown. Se procesan en segundo plano y, si fallan, puedes reintentar.
- **Chat:** preguntas sobre tus apuntes, con las fuentes citadas.
- **Flashcards:** se generan desde un documento y se repasan con repetición espaciada.
- **Coach semanal:** un informe de tu semana de entrenamiento. Tus lesiones no se envían a la IA.
- **Pregunta a tus datos:** «¿cuánto he lanzado este mes?». Se envía un resumen numérico de tus entrenos (nunca salud, ciclo ni notas).
- **Horario y exámenes:** clases semanales (con fecha de fin del cuatrimestre) y exámenes. Si un entreno planificado cae el día de un examen o la víspera, te avisa.
- **Pomodoro:** elige asignatura y duración; cada bloque terminado se anota solo. Gráfica de la semana y horas por asignatura. Sin temporizador, «Anotar» a mano.

## Ajustes

- **Seguridad:**
  - cambiar la contraseña o el email (cierra las demás sesiones);
  - «Cerrar sesión en todos los dispositivos».
- **Verificación en dos pasos:**
  - app de autenticación + 10 códigos de recuperación de un solo uso;
  - si pierdes el móvil y los códigos, el administrador puede desactivarla desde el servidor.
- **Mis reglas:** redondeo de kg, umbral de la serie de test y de los avisos (squeeze, talón, molestias, peso, % de grasa, tope de lanzamientos, horas entre sesiones de lanzamiento, VFC y vídeo). Vienen con valores genéricos: ponlos según tu plan.
- **Notificaciones:** resumen diario, informe semanal del coach, **aviso de inicio de sesión nuevo** y **recordatorios**: «mañana toca…» (a la hora que elijas), control del lunes y pesarse L-X-V. No llegan si ya lo has apuntado.
- **Calendario en el móvil:** ver Planificación.
- **Informe para la entrenadora:** elige el periodo (esta semana, la pasada o las últimas 4) y, si quieres, incluye tus molestias. Crea un enlace de solo lectura que **caduca a los 7 días** y se puede revocar: planificado frente a hecho, lanzamientos, mejores marcas y controles. Nunca incluye el ciclo, el peso, la VFC, las notas ni la nutrición.
- **Mi pista:** coordenadas de tu pista (temperatura, viento y lluvia de tus sesiones técnicas, de Open-Meteo) (el calentamiento cronometrado está en el modo competición, con bloques editables).
- **Entrenador / atletas:** si eres entrenador/a, «Ver y comentar las sesiones de tus atletas» abre **Mis atletas**: sus sesiones de 2 semanas y la próxima, y un hilo de comentarios en cada una. El atleta recibe un push y responde desde la sesión. Hace falta que te haya dado el permiso de **sesiones**.
- **Estado del servidor** (solo administración): versión, base de datos, migraciones, cola, planificador, espacio libre y última copia. Míralo después de cada actualización.
- **Actividad reciente:** inicios de sesión, cambios de contraseña, 2FA… (se guarda 180 días).
- **Entrenador / atletas:** invita a tu entrenador y elige qué puede ver (carga, sesiones, recuperación, planificación, informes) y si puede planificarte.
- **Tus datos:** descargar todo en JSON, CSV de entrenos y finanzas, y **borrar la cuenta** (definitivo).
