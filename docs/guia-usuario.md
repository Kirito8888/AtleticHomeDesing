# Atlenza — Guía de uso

Cómo se usa la app día a día, módulo a módulo. Para instalarla en un servidor, ver [`manual_docker_debian.md`](../manual_docker_debian.md); para saber cómo funciona por dentro, [`arquitectura.md`](arquitectura.md) y [`manual_backend.md`](../manual_backend.md).

**Navegación.** En el móvil, la barra inferior tiene **Inicio · Entreno · Plan · Nutrición · Atlenza IA**. **Recuperación, Finanzas y Ajustes** están en el menú ☰ de arriba a la derecha, y la lupa 🔍 abre la **búsqueda** (sesiones, ejercicios, días del plan, tareas y apuntes). En el ordenador, todo está en la barra lateral.

**Instalarla como app.** Ábrela por HTTPS, abre el menú del navegador y elige «Añadir a pantalla de inicio» (Safari: Compartir → Añadir a pantalla de inicio). Las notificaciones en iPhone solo funcionan así.

---

## Primeros pasos

1. **Ajustes → Perfil:** sexo, peso y disciplina.
2. **Ajustes → Umbrales fisiológicos:** FC máxima, FC de reposo, LTHR y ritmo umbral, cada uno con su fecha de inicio. Cada sesión se calcula con los umbrales vigentes ese día, así que actualizarlos no reescribe el pasado.
3. **Ajustes → Objetivo nutricional diario:** kcal y macros.
4. **Ajustes → Verificación en dos pasos:** actívala y guarda los 10 códigos de recuperación en tu gestor de contraseñas.
5. Si quieres, **Planificación → Importar plan** (ver abajo), o **Atlenza IA → Crear plan** si no tienes uno.
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

Sirve para tener en Atlenza el plan de la temporada que tienes en PDF («M5 · Acumulación II · día a día», etc.).

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

## Atlenza IA: crear tu planificación

**Atlenza IA → Crear plan.** Requiere la IA activada (Ajustes → Privacidad e IA) y la clave de Gemini en el servidor.

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

## Atlenza IA (estudio)

Requiere activarla en **Ajustes → Privacidad e IA**: está desactivada hasta que la autorizas, porque envía texto a Google Gemini.

- **Apuntes:** sube PDF, TXT o Markdown. Se procesan en segundo plano y, si fallan, puedes reintentar.
- **Chat:** preguntas sobre tus apuntes, con las fuentes citadas.
- **Flashcards:** se generan desde un documento y se repasan con repetición espaciada.
- **Coach semanal:** un informe de tu semana de entrenamiento. Tus lesiones no se envían a la IA.
- **Pregunta a tus datos:** «¿cuánto he lanzado este mes?». Se envía un resumen numérico de tus entrenos (nunca salud, ciclo ni notas).
- **Horario y exámenes:** clases semanales (con fecha de fin del cuatrimestre) y exámenes. Si un entreno planificado cae el día de un examen o la víspera, te avisa.
- **Pomodoro:** elige asignatura y duración; cada bloque terminado se anota solo. Gráfica de la semana y horas por asignatura. Sin temporizador, «Anotar» a mano.

## Novedades de la v1.8 (dónde está cada cosa)

**Para empezar**
- **Bienvenida** (te la ofrece el panel): elige qué partes de Atlenza usas, tu perfil y las horas sin avisos. Todo se cambia después en Ajustes.
- **Ajustes → Módulos:** oculta lo que no uses. No se borra nada.
- **Ajustes → Accesibilidad:** letra más grande y contraste alto.

**Avisos**
- **Campana** (arriba): todo lo que Atlenza te ha avisado en los últimos 60 días, aunque no tengas el push activado.
- **«Recordar en 1 h»** en cada aviso, desde la campana o desde la notificación del móvil.
- **Ajustes → Notificaciones:** horas de silencio. Los avisos de seguridad y de «entreno sola» llegan siempre.

**Si te equivocas al borrar**
- Al borrar una sesión, una comida o un movimiento sale **«Deshacer»** durante unos segundos.
- Después, **Ajustes → Papelera** lo guarda 7 días.

**Compartir con Atlenza** (con la app instalada, en Android)
- Desde el correo, el navegador o la galería: «Compartir» → Atlenza.
- Te propone qué hacer según el fichero:
  - calendario de la federación → competiciones;
  - PDF o zip del plan → importar el plan;
  - extracto → finanzas;
  - apuntes → estudio;
  - foto → molestia o justificante.
- Nada se guarda hasta que lo confirmas en la pantalla de siempre.

**Planificar y revisar**
- **Inicio → Semana** (o Plan → Mi semana): entreno, clases, exámenes, estudio, entregas, citas y competiciones juntos.
- **Revisión semanal** (el domingo te avisa): tu semana en cuatro líneas y tres preguntas. El **foco** sale en el panel toda la semana siguiente.
- **Objetivos** (menú): marca, test físico, racha de un hábito, gasto del mes o uno a mano. El progreso se calcula solo con lo que ya registras.

**Entreno**
- **Rendimiento → Informe de temporada:** una hoja para imprimir o guardar en PDF.
- **Modo competición → Viaje y tiempo:** guarda las coordenadas del estadio y, 16 días antes, verás el pronóstico con consejos para la bolsa.
- **Nueva sesión → De tu entrenadora:** plantillas que te ha compartido; «Copiar» las añade a las tuyas.
- **Entrenadoras:** en Nueva sesión, «Compartir plantillas con tus atletas».

**Estudio**
- **Flashcards → Examen simulado:** tarjetas al azar con tiempo. Las que falles vuelven hoy al repaso.

**Finanzas**
- **Movimiento sin categoría → «Sin categoría»:** elige una y marca «Aplicar a los parecidos». Los iguales (y los de las próximas importaciones) se categorizan solos.
- **Fondo de emergencia:** cuántos meses de gastos cubre tu dinero y cuánto falta para tu objetivo.

**Tus datos**
- **Ajustes → Exportar:** CSV de recuperación, comidas y estudio (además de entrenos y finanzas).
- **Ajustes → Lo que más y menos usas:** contador de páginas, solo en tu servidor. Se puede desactivar.

## Novedades de la v1.7 (dónde está cada cosa)

**Nada cambia tu planificación por su cuenta y la salud no sale de tu cuenta.**
- La rutina del cuestionario queda en **borrador** hasta que la actives.
- Lo de salud va cifrado: ni la IA ni tu entrenadora lo ven.

**Seguridad y privacidad**
- **Ajustes → Llaves de acceso:** añade la huella o la cara del móvil. En el login, «Entrar con llave de acceso». Solo funciona con HTTPS.
- **Ajustes → Privacidad y derechos:**
  - consentimientos con su historial;
  - **limitar el tratamiento** (pausa la IA, el acceso de tu entrenadora y los enlaces compartidos);
  - pedir rectificación, supresión u oposición (queda registrado);
  - plazos de conservación.
- **Ajustes → Actividad reciente:** el registro está encadenado. Si alguien lo altera en la base de datos, verás el aviso.
- Avisos push de lo sensible: llave nueva, enlace compartido, datos descargados…
- En el login, enlaces a la **política de privacidad** y al **aviso legal**.

**Entreno → Crear mi rutina**
- 5 pasos: tú, salud, tests, objetivos y horario.
- Si marcas algo en salud, te pide hablar antes con un profesional sanitario.
- Sale tu perfil, la rutina en borrador y una **gráfica de lo que puedes lograr si la sigues**:
  - línea esperada y franja prudente–optimista;
  - es una estimación, no una promesa.
- Repite los tests cada 4 semanas («Anotar test»): tus puntos aparecen sobre la curva.

**Entreno y competición**
- **Etiquetas** en cada sesión, con su **Diario técnico** (Entreno) para buscar por etiqueta.
- **Entreno → Comparar sesiones:** dos sesiones lado a lado.
- **Jabalina:**
  - lanzamientos por implemento y semana;
  - récords por temporada y categoría (pon tu fecha de nacimiento en el perfil).
- **Modo competición:**
  - el «Simulador de intentos» calcula a qué hora te toca cada uno según atletas, tu orden y el tiempo por intento;
  - calentamientos de **pruebas combinadas**.
- **Planificación → Importar calendario de competiciones:** `.ics` de la federación o CSV `fecha;competición;lugar`. No duplica.

**Recuperación → Bienestar**
- **Diario de sueño:** horas en la cama, latencia, despertares, calidad, cafeína (te dice cuánta te quedaba al acostarte) e higiene, con consejos.
- **Ánimo y estrés:** con tendencia de 7 días. Si el ánimo sigue bajo, te anima a hablarlo; la **línea 024** atiende 24 h.
- **Escalas:** EVA (dolor) y dos escalas propias de Atlenza (brazo y hombro, Aquiles). No son cuestionarios validados: sirven para ver tu tendencia, no son un diagnóstico.
- **Movilidad sugerida** según la fatiga por zona de tu última sesión. El umbral es el del semáforo, en Mis reglas.
- **Respiración guiada:** caja, 4-7-8 para dormir, coherencia y activación antes de competir.

**Otros cambios en Recuperación**
- **Fotos de una molestia:** se reducen y pierden el EXIF en el móvil antes de subir, y se guardan cifradas. Pulsa la fecha para verla.
- **Citas y suplementos:**
  - **Informe anual de salud:** enlace de 7 días con 12 meses mes a mes;
  - **Calendario de tomas:** eliges los días de cada suplemento y marcas lo que tomaste. Sin dosis.

**Salud de la mujer**
- En Ajustes de la sección: **anticoncepción** y **etapa** (peri o posmenopausia).
- Sale una explicación de cómo cambia la lectura de tus datos y, en la menopausia, pautas y registro de síntomas.

**Nutrición**
- **Plan semanal:** tus recetas por día y comida. Un botón pasa los ingredientes de la semana a la lista de la compra.
- **Lista de la compra → Escanear en el súper:** lo que escaneas se tacha si estaba en la lista; si no, se añade (con el Nutri-Score).
- **Sudoración:**
  1. pésate antes y después de entrenar;
  2. apunta lo que bebiste;
  3. sabrás tus litros por hora y cuánto beber para no perder más del 2 %.

**Atlenza IA (estudio)**
- **Flashcards:** «Crear tarjetas a mano (sin IA)»; pega varias como `pregunta | respuesta`.
- **Trabajos y entregas:** avisos («en 2 días y sin empezar»), estado, nota y media ponderada.
- **Pomodoro:** «Cuándo te concentras mejor», con tus franjas de los últimos 60 días.

**Finanzas**
- **Presupuesto de la temporada:**
  - lo que prevés por concepto y lo que cuesta de media una competición;
  - la previsión toma lo mayor entre tu ritmo actual y las competiciones que quedan.
  - Cuenta los movimientos marcados con 🏅.
- **Clip en cada gasto:** adjunta el justificante (PDF o foto). Se guarda cifrado.
- **Suscripciones:**
  - si un cargo del banco es mayor que lo guardado, aparece un aviso con «Actualizar»;
  - «Cambiar importe» deja constancia de la subida.

**Plataforma**
- **Sin conexión:** además de las sesiones, el **agua**, los **hábitos** y las **comidas** se guardan en el móvil y se envían al volver la cobertura.
- **Inicio → «De un vistazo»:** el día en una lista ligera. Añádela a la pantalla de inicio.
- **Cuentas de demostración** (solo administración, en Ajustes → Estado del servidor):
  - elige un público (principiante, corredora, persona mayor, posparto o lanzador);
  - entra con los datos que salen (**solo se muestran una vez**) en una ventana privada;
  - son datos inventados y se borran solos a los 30 días.

## Novedades de la v1.6 (dónde está cada cosa)

**Nada de esto cambia tu planificación por su cuenta.** Lo que sugiere (kg del día, afinamiento, recolocar) aparece junto al plan y solo se aplica si pulsas «Usar» o «Aplicar». El afinamiento se quita con otro botón y el día vuelve a ser el original.

**Entreno**
- **Kg del día:** en el registro de fuerza, tras la primera serie con RIR (o velocidad), aparece «Kg del día de X» con el motivo. «Usar en las series que quedan» lo copia al formulario. Como mucho se aleja un 5 % del plan (Mis reglas).
- **Fatiga por zona:** al cerrar la sesión, puntúa hombro, codo, espalda… de 0 a 10. La tendencia sale en Recuperación.
- **Entreno → Análisis de jabalina:** clave técnica (escríbela en la sesión técnica), equivalencia entre pesos, «¿día bueno o progreso?», mínimas con fecha límite y previsión de marca. Si no hay datos suficientes, lo dice.
- **Entreno → Prehabilitación:** rutinas de hombro y codo, marcado de un toque y adherencia de la semana.
- **Entreno → Temporadas:** año frente a año.
- **Registrar sin cobertura:** si guardas una sesión sin conexión, se queda en el móvil («N sesiones sin enviar») y se manda sola al volver. Solo sesiones; el agua y los hábitos necesitan conexión.

**Planificación**
- **Afinamiento:** en el modo competición de una competición A, «Aplicar el afinamiento» recorta un % de series los días previos (Mis reglas: días y %). «Quitar el afinamiento» lo deshace.
- **Recolocar:** en una sesión planificada que no hiciste, «Recolocar la sesión» propone hasta 3 días que respetan las horas entre lanzamientos, tus exámenes y (si usas el ciclo) los días previstos con síntomas. «Mover aquí» la mueve.
- **Semanas tipo:** en tu plan propio, guarda una semana como tipo y aplícala a otra.
- **Semáforo del día** en Inicio: normal, suave o descanso, con el porqué.

**Recuperación**
- **Antropometría:** perímetros y pliegues con tendencia.
- **Citas y suplementos:** citas de fisio o médico con aviso la tarde anterior; suplementos con lote y «comprobado en la lista oficial». La app no dice si algo está permitido: compruébalo siempre. Desde aquí creas el **enlace para tu fisio**.
- **Importar de Apple Health:** en el iPhone, Salud → tu foto → Exportar todos los datos; descomprime y elige `export.xml`. Se lee en el móvil y solo se envían sueño y FC en reposo por día.
- **Mapa del dolor:** toca la zona en la silueta al anotar una molestia o una sensación.

**Salud de la mujer** (cifrado; ni la IA ni tu entrenadora lo ven)
- **Tu patrón:** con 3 ciclos registrados, compara tu rendimiento en días con y sin síntomas. Si la diferencia puede ser casualidad, lo dice.
- **Próximos días (aprendido de tus ciclos):** probabilidad de síntomas según tus registros.
- **Salud ósea:** cribado y aviso para pedir valoración; recordatorio opcional de trabajo de impacto.
- **Enlace para tu médica:** 7 días, revocable.
- **Hierro:** marca «Fe» al anotar comidas ricas en hierro; verás cuántos días de la semana llegas.
- **Entreno sola, con aviso** (Salud de la mujer → «Entreno sola» → Abrir):
  1. Invita a tu contacto por su email de Atlenza; tiene que aceptarlo desde su cuenta.
  2. Al salir, elige cuánto tardas y pulsa «Salgo». Al volver, pulsa «Llegué».
  3. Si se pasa la hora, tu contacto recibe un push. Solo push: sin SMS ni email, y tu contacto necesita la app instalada con notificaciones.

**Nutrición**
- **Lista de la compra** (botón en Nutrición): añade a mano o elige favoritas y «Añadir sus ingredientes».
- **Recetas:** ingredientes con sus macros por 100 g (o búscalos en OpenFoodFacts) → macros por ración. «Anotar hoy» o «A favoritas».
- **Comida del día de competición:** en el modo competición, lo que toca ahora sale resaltado. «Editar» cambia la plantilla para todas.

**Atlenza IA → Exámenes y notas**
- **Plan hasta el examen:** pon las horas que quieres para cada examen (salen del horario) y pulsa «Generar plan de estudio». Reparte bloques descontando clases y días de entreno; la víspera, solo esa asignatura. Si no da tiempo, te dice cuánto falta. Cada pomodoro tacha los bloques del día de esa asignatura.
- **Notas y créditos:** media ponderada, créditos aprobados y pendientes.

**Finanzas → Viajes y plazos**
- **Viaje:** elige la competición, pon el presupuesto por partidas y lo que reembolsa la federación. Enlaza los gastos (quedan como deportivos) y marca el reembolso cuando lo cobres.
- **Plazos:** inscripciones, licencia, becas; push N días antes.

**Ajustes**
- **Calendario:** «Incluir mis clases y exámenes» (solo la asignatura).
- **Restaurar una exportación:** solo en una cuenta vacía. Entran entrenos, recuperación, salud (se vuelve a cifrar), calendario, comidas, recetas, estudio y plazos. No entran finanzas, viajes, apuntes, planes importados ni vínculos.
- **Accesos directos:** mantén pulsado el icono de la app para ir a Sesión, Agua, Pomodoro o Hábitos.

**Si eres entrenador/a:** en Mis atletas tienes la comparativa (carga 7 días, cumplimiento 14 días, mejor marca 30 días; cada dato solo si te dieron ese permiso) y «Comentar varias sesiones a la vez».

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
