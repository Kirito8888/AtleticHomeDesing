# Cambios

Formato: una entrada por versión, lo más reciente arriba. Cómo actualizar el servidor entre versiones: [`manual_docker_debian.md` § 8](manual_docker_debian.md#actualizar-a-una-nueva-versión).

## v1.8 — calidad, experiencia de uso y 12 funcionalidades nuevas (10/10/2026)

**Regla de diseño de siempre:** nada toca tu planificación sin confirmar y la salud no sale de tu cuenta. Lo nuevo de esta versión no lee salud cifrada (el informe de temporada, «Mi semana» y los CSV tampoco).

**Calidad, seguridad y operación**
- **Accesibilidad WCAG 2.1 AA:** axe revisa las páginas principales en la CI (0 fallos serios). Sube el contraste del texto secundario y de los avisos emergentes.
- **Menos JavaScript:** las gráficas cargan en diferido. La página más pesada baja de ~435 a ~330 KB (gzip) y la CI falla si alguna pasa de 380 KB.
- **Uso local** (Ajustes → Lo que más y menos usas): contador semanal de páginas, solo en tu servidor y desactivable.
- **Ocultar módulos** (Ajustes → Módulos): desaparecen del menú y del panel sin borrar nada.
- **Estado del servidor:**
  - versión del código y aviso de **versión nueva disponible** en GitHub;
  - **errores recientes** del servidor e informes de la CSP (sin datos personales, 30 días);
  - **revisión de integridad**: ficheros sin registro, sesiones sin TSS y carga desfasada.
- **Aviso a la administración** si la última copia de seguridad falló o tiene más de 36 h. Sustituye a la «prueba de restauración mensual» del plan: `backup.sh` ya restaura y comprueba **cada** copia.
- **El límite de intentos** de login, llave, registro y contraseña vive en la base de datos: sobrevive a los reinicios.
- **La administración exige 2FA o una llave de acceso** además del rol ADMIN.
- Módulos `v17-*` renombrados por dominio (sin cambios de lógica).

**Experiencia de uso**
- **Primer uso guiado** (`/welcome`, 3 pasos): qué módulos usas, tu perfil y horas de silencio. El panel te lo ofrece mientras no lo hagas.
- **Centro de notificaciones** con campana y no leídas. Todo aviso queda ahí aunque no tengas el push activado.
- **Horas de silencio:** sin push en esa franja, salvo seguridad y «entreno sola».
- **Papelera de 7 días** para sesiones, comidas y movimientos: «Deshacer» en el aviso y Ajustes → Papelera.
- **Compartir con LifeOS** desde otras apps (con la app instalada; Android/Chrome). Según el fichero:
  - `.ics` o CSV → importar competiciones;
  - PDF o zip → importar el plan;
  - extracto → finanzas;
  - apuntes → estudio;
  - foto → molestia o justificante.
- **Búsqueda** ampliada: etiquetas del diario técnico, competiciones, rutinas, trabajos y recetas.
- **Tamaño de letra y contraste alto** (Ajustes → Accesibilidad).

**Funcionalidades nuevas**
- **Revisión semanal** (domingo, con aviso desactivable): resumen y tres preguntas. El foco elegido sale en el panel toda la semana.
- **Objetivos** con progreso automático (mejor marca, último test, racha de un hábito o gasto del mes) o a mano.
- **Informe de temporada** imprimible: marcas, carga por mes, competiciones, molestias y balance deportivo.
- **Viaje de competición:** lugar del estadio y pronóstico del día (Open-Meteo, 16 días antes) con consejos para la bolsa.
- **Examen simulado** con tus flashcards: tiempo, autoevaluación y las falladas vuelven al repaso.
- **Reglas de categoría aprendidas:** «aplicar a los parecidos» categoriza ya los movimientos iguales y los de las próximas importaciones.
- **Fondo de emergencia:** meses de gastos cubiertos, objetivo configurable y proyección a 12 meses.
- **Biblioteca de la entrenadora:** comparte plantillas y el atleta las copia (con sus ejercicios).
- **CSV** de recuperación, comidas y estudio (además de entrenos y finanzas).
- **Comparar una rutina con una cuenta demo** (solo administración).
- **«Recordar en 1 h»** en las notificaciones.
- **Mi semana:** entreno, clases, exámenes, estudio, entregas, citas y competiciones en una vista.

**Datos**
- Migración aditiva `v1_8_features`, probada sobre una copia v1.7 con datos (idénticos antes y después).
- Exportación con revisiones, objetivos, reglas, bandeja, uso y papelera. Se restauran revisiones y objetivos; los de gasto no, porque las finanzas no se restauran.

## v1.7 — seguridad, privacidad (RGPD/LOPDGDD), menos recursos y 30 funcionalidades (10/10/2026)

**Regla de diseño de toda la versión: nada toca tu planificación sin que lo confirmes, y la salud no sale de tu cuenta.** Las rutinas del cuestionario quedan como **borrador**. Todo lo de salud nuevo (bienestar, escalas, fotos, anticoncepción, menopausia) va **cifrado**: nunca va a la IA, la entrenadora no lo ve y no sale en el `.ics` ni en los informes compartidos (solo en los que tú creas para tu médica o fisio). Entra en la exportación y en el borrado.

**Operación y menos recursos**
- `update.sh` construye la imagen nueva **antes** de parar nada (si el build falla, no cambia nada).
- `update.sh` borra los contenedores `web` huérfanos que causaron el «Conflict» de la v1.6 y reintenta una vez.
- `update.sh` aplica la configuración nueva de la base de datos y actualiza el servicio de copias si está en marcha.
- **Límites de memoria y CPU** configurables:
  - `web`: 1 GB y heap de Node de 640 MB;
  - `db`: 768 MB;
  - `backup`: 256 MB.
- Postgres ajustado para un servidor pequeño: `shared_buffers` 128 MB, `max_connections` 30, autovacuum cada 5 min y registro de consultas lentas.
- La app abre como mucho 5 conexiones a la base de datos (`DB_POOL_MAX`).
- **Contenedor web endurecido:**
  - sistema de ficheros de solo lectura (con `/tmp` y la caché de Next en memoria);
  - sin capacidades (`cap_drop: ALL`) y `no-new-privileges`;
  - imagen sin npm ni yarn.
- La imagen pesa menos: no lleva el código fuente.
- Imágenes fijadas por versión: Postgres + pgvector 0.8.7 y pgAdmin 9.18.
- Cabeceras de seguridad nuevas: CORP, Origin-Agent-Cluster, X-Permitted-Cross-Domain-Policies y sin `X-Powered-By`.

**Seguridad**
- **Llaves de acceso (passkeys):** entra con la huella o la cara del móvil (Ajustes → Llaves de acceso). Requieren HTTPS y `AUTH_URL` con tu dominio.
- **Contraseñas con Argon2id.** Las antiguas (scrypt) se convierten solas la próxima vez que entres.
- **Registro de actividad encadenado:** cada evento lleva la huella del anterior. Si alguien lo toca en la base de datos, Ajustes lo dice.
- **Avisos push** de eventos sensibles: cuenta bloqueada, contraseña, email o 2FA cambiados, llave añadida o quitada, datos descargados, enlace compartido creado y sesiones cerradas.
- **Rotación de claves de cifrado** sin perder datos:
  - variables `*_PREVIOUS`;
  - botón «Volver a cifrar» en Estado del servidor.
- **Copias de seguridad:**
  - mensuales que se guardan `BACKUP_KEEP_MONTHS` meses;
  - copia opcional a otra máquina por SSH (`BACKUP_REMOTE`).
- **CI:**
  - Trivy analiza la imagen (falla con vulnerabilidades altas o críticas que tengan arreglo);
  - lista de componentes (SBOM CycloneDX).
- **Plan de respuesta a incidentes** con plantilla de notificación a la AEPD en 72 h: `docs/seguridad-incidentes.md`.

**Privacidad (RGPD y LOPDGDD)**
- **Consentimientos con versión e historial** (IA, salud, entrenadora y contacto de seguridad). El de IA explica la transferencia internacional (Google).
- **Mis derechos** (Ajustes → Privacidad):
  - acceso y portabilidad (exportación);
  - rectificación;
  - supresión;
  - oposición;
  - **limitación del tratamiento**: corta la IA, el acceso de la entrenadora y los enlaces compartidos hasta que la levantes.
- Cada solicitud queda registrada.
- **Plazos de conservación** con borrado automático: registro de actividad, «entreno sola», notificaciones, enlaces caducados y cuentas demo. Se cambian con `RETENTION_*_DAYS`.
- **Páginas públicas** `/legal/privacidad` y `/legal/aviso`, rellenas con tus datos desde variables (`LEGAL_*`). Solo cookies técnicas.
- **Plantillas** en `docs/rgpd/`: registro de actividades, EIPD y contrato de encargado. Solo hacen falta si otras personas usan tu servidor.

**1 · Creador de rutinas con cuestionario** (Entreno → Crear mi rutina)
- **El cuestionario** recoge quién eres, tu salud (estilo PAR-Q), tests sencillos, objetivos a corto y largo plazo y tu horario.
- **El perfil** sale con su porqué.
- **La rutina se genera sin IA y queda en borrador**, para revisarla y activarla.
- **Bloqueos de prudencia:**
  - si marcas algo en salud, pide antes el visto bueno de un profesional;
  - con embarazo o posparto no se genera.
- **Gráfica de progreso proyectado** por test:
  - línea esperada y franja prudente–optimista;
  - tus retests encima.
- La gráfica es una **estimación** con rendimientos decrecientes, no una promesa.

**Entreno y competición (2–8)**
- Diario técnico con etiquetas y búsqueda.
- Importar calendario de competiciones desde `.ics` o CSV, sin duplicar.
- Simulador de los 6 intentos (a qué hora te toca cada uno).
- Calentamientos de pruebas combinadas según el hueco entre pruebas.
- Lanzamientos por implemento y semana.
- Comparador de dos sesiones.
- Récords por temporada y categoría RFEA.

**Salud (9–17)**
- Diario de sueño: horas, latencia, despertares, cafeína que queda al acostarte e higiene, con consejos.
- **Escalas:** EVA, QuickDASH y una adaptación del VISA-A para el Aquiles. Sirven para ver la tendencia, no para diagnosticar.
- Movilidad sugerida según la fatiga por zona de tu última sesión.
- **Fotos de lesión:**
  - el navegador las reescala y les quita el EXIF;
  - se guardan cifradas en disco y no se cachean;
  - se borran con la molestia.
- Respiración guiada: caja, 4-7-8, coherencia y activación.
- **Ánimo y estrés** con tendencia. Si el ánimo sigue bajo, recomienda hablarlo y da la línea 024.
- **Anticoncepción:** cómo cambia la lectura del ciclo.
- **Peri y posmenopausia:** pautas y registro de síntomas.
- **Informe anual de salud:** enlace temporal con 12 meses mes a mes.

**Nutrición y estudio (18–24)**
- **Plan semanal de comidas** con tus recetas. Los ingredientes pasan a la lista de la compra escalados a las raciones.
- **Escáner en el súper:** tacha lo que escaneas o lo añade, con el Nutri-Score.
- **Calendario de suplementos sin dosis:**
  - qué días toca y si lo tomaste;
  - cumplimiento de la semana.
- **Tasa de sudoración:** cuánto pierdes por hora y cuánto beber para no pasar del 2 %.
- **Tarjetas de repaso a mano** (sin IA, mismo SM-2). Se pueden pegar varias como «pregunta | respuesta».
- **Trabajos y entregas** con avisos y nota media ponderada.
- **Concentración por franja horaria:** cuándo te rinden más los pomodoros.

**Finanzas y plataforma (25–30)**
- **Presupuesto de la temporada** por conceptos, con previsión. Toma la mayor de dos:
  - el ritmo actual;
  - el calendario: competiciones que quedan × coste medio.
- **Justificantes** (PDF o foto) en cada gasto:
  - se comprueba la firma real del fichero;
  - se guardan cifrados;
  - entran en la rotación de claves.
- **Subidas de precio de suscripciones:**
  - se detectan en los cargos o al cambiar el importe;
  - aviso en Finanzas y en el resumen diario.
- **Sin conexión:** agua, hábitos y comidas también pasan por la bandeja. Los hábitos no se invierten si se reenvían.
- **«De un vistazo»** (`/glance`): el día en una lista ligera, sin gráficas.
- **Cuentas de demostración por tipo de público** (solo administración): principiante, corredora, persona mayor, posparto y lanzador.
  - datos inventados y correo `.invalid` que no existe;
  - contraseña mostrada una vez;
  - **se borran solas a los 30 días**.

**Exportar y restaurar:**
- **La exportación incluye todo lo nuevo:**
  - llaves (solo el nombre);
  - consentimientos;
  - rutinas;
  - bienestar descifrado;
  - metadatos de fotos y justificantes;
  - plan de comidas;
  - tomas;
  - sudoración;
  - trabajos;
  - presupuesto;
  - cambios de precio.
- **La restauración recupera:**
  - etiquetas;
  - tomas;
  - plan de comidas;
  - sudoración;
  - trabajos;
  - presupuesto;
  - bienestar (cifrado otra vez con la clave del servidor).

**Lo que no se ha hecho y por qué:**
- **Análisis de vídeo:** lo descartaste.
- **Caché del panel en memoria:** con una sola persona, el riesgo de ver datos viejos pesa más que el ahorro.
- **ENS y NIS2:** no te obligan. Se han usado como buenas prácticas, sin afirmar que se cumplen.

## v1.6 — 36 funcionalidades: mujeres, fuerza autorregulada, plan inteligente, jabalina, salud, cocina, estudio y viajes (9/10/2026)

**Regla de diseño de toda la versión: nada toca tu planificación sin que lo confirmes.** Los kg del día, el afinamiento y la recolocación son **sugerencias** junto al plan; solo se aplican con «Usar» o «Aplicar». El afinamiento se guarda aparte (`PlanDay.taperPct`), se aplica al mostrar el día y se quita con un botón: el contenido del día queda intacto (lo comprueba un test de integración).

**Mujeres** (todo cifrado, nunca a la IA, la entrenadora no lo ve, fuera del `.ics` y de los informes compartidos; entra en la exportación y en el borrado)
- **Patrón ciclo–rendimiento:** con ≥ 3 ciclos registrados compara RPE, kg frente a la RM, marcas y readiness en días con y sin síntomas. Con pocos datos dice «aún no hay suficiente».
- **Predicción aprendida:** probabilidad de síntomas por día del ciclo calculada con tus registros; sustituye a la previsión genérica cuando hay datos (calendario y versión suave).
- **Salud ósea:** cribado (fracturas de estrés previas, regla ausente, disponibilidad energética, impactos semanales, calcio y vitamina D) con aviso de prudencia y recordatorio opcional de trabajo de impacto.
- **Informe para tu médica:** enlace temporal (7 días, revocable) con ciclo, analíticas y cribados; HTML sin JavaScript, descifrado solo al servirlo.
- **Hierro en la dieta:** marca «Fe» en comidas y favoritas (y el hierro de OpenFoodFacts si viene), días ricos en hierro por semana y consejos (vitamina C, café y té). Nunca da dosis.
- **Entreno sola, con aviso:** «Salgo» con hora de vuelta y «Llegué». Si no llegas a tiempo, tu contacto de confianza (otra cuenta de LifeOS que aceptó el vínculo) recibe un push. Ubicación solo si la compartes en ese momento. **Sin SMS ni email:** el contacto necesita la app con notificaciones.

**Fuerza y prevención**
- **Kg del día autorregulados:** con el RIR (o la velocidad) de la primera serie efectiva estima tu RM de hoy y sugiere el kg, como mucho ±5 % del plan (editable en Mis reglas) y redondeado a tus discos. «Usar en las series que quedan» lo aplica al formulario; el plan y la tabla de RM no cambian. «Planificado frente a hecho» enseña plan / sugerido / hecho.
- **Prehabilitación** de hombro y codo: rutinas editables, marcado de un toque y adherencia semanal.
- **Fatiga por zona** (0–10) al cerrar la sesión, con tendencia en Recuperación; una zona alta entra en el semáforo.
- **Antropometría:** perímetros y pliegues con tendencia (solo tú).

**Planificación inteligente**
- **Afinamiento** antes de una competición A: recorta un % de series los N días previos (Mis reglas). Reversible.
- **Recolocar una sesión saltada:** huecos que respetan las horas entre lanzamientos, los exámenes y los días previstos con síntomas. Solo mueve al pulsar.
- **Semáforo del día** en Inicio (normal / suave / descanso) con el porqué: readiness, Hooper, molestias, vuelta tras lesión, fatiga por zona y ciclo (si lo usas).
- **Semanas tipo:** guarda una semana de tu plan propio y aplícala a otra (nunca a planes importados ni con IA).
- **Comparar temporadas:** carga, lanzamientos, marcas y días con molestias, año frente a año.

**Jabalina y competición** (Entreno → Jabalina)
- **Clave técnica** por sesión y su relación con la media y la mejor marca.
- **Equivalencia entre implementos** (regresión con tus datos) y progresión por peso.
- **Condiciones y marcas:** ¿día bueno o progreso? (residuo frente a la tendencia).
- **Mínimas** con fecha límite, lo que falta y la tendencia.
- **Previsión de marca en competición** con margen de error, a partir de tu relación entreno/competición. Sin datos suficientes no la da.

**Recuperación y salud**
- **Importar Apple Health** (`export.xml`, leído en el navegador en streaming): sueño y FC en reposo. La VFC de Apple (SDNN) no se importa: no es comparable con la RMSSD.
- **Mapa corporal del dolor** táctil para molestias y sensaciones.
- **Suplementos** con marca, lote y dosis anotada, y recordatorio de comprobarlo en la lista oficial antes de competir. La app **no dice si algo está permitido**.
- **Citas** de fisio y médico con aviso la tarde anterior y **enlace para el fisio** (molestias, vuelta y carga; mismo patrón que el de tu médica).

**Nutrición**
- **Comida del día de competición** (antes / entre rondas / después) en el modo competición, con lo que toca ahora resaltado; plantilla editable.
- **Lista de la compra** a mano o desde tus favoritas (las que vienen de una receta aportan sus ingredientes).
- **Recetas** con macros por ración calculados por ingredientes (con búsqueda en OpenFoodFacts); se anotan en el día o pasan a favoritas.

**Estudio**
- **Plan hasta el examen:** reparte las horas que pidas por examen entre los días que quedan, descontando clases y días de entreno; la víspera, solo esa asignatura. Si no da tiempo, lo dice. El pomodoro tacha los bloques solo.
- **Notas y créditos** con media ponderada.
- **Clases y exámenes en el `.ics`** (opcional en Ajustes → Calendario; solo la asignatura, sin aula).

**Finanzas**
- **Viajes de competición:** presupuesto por partidas, gastos enlazados (quedan como deportivos y con su competición), lo que te cuesta tras el reembolso y lo que te debe la federación.
- **Plazos** (inscripciones, licencia, becas) con push N días antes.

**Plataforma**
- **Registrar sin conexión:** si guardas una sesión sin cobertura queda en una bandeja del móvil y se envía sola al volver; no se duplica aunque se reenvíe. Solo sesiones (agua y hábitos todavía no).
- **Restaurar una exportación** en una cuenta vacía (Ajustes). No entran finanzas, viajes, apuntes, planes importados ni vínculos.
- **Panel de entrenadora multiatleta:** comparativa de carga, cumplimiento y marcas, y comentar varias sesiones a la vez, con los mismos permisos (nunca salud ni finanzas).
- **Accesos directos** de la app instalada: Sesión, Agua, Pomodoro y Hábitos.

**Corrección:** el `.ics` escapa bien el punto y coma (RFC 5545).

**Base de datos:** una migración aditiva (`v1_6_features`): tablas nuevas y columnas opcionales. Probada sobre una copia de una BD v1.5 con datos: plan y sesiones idénticos byte a byte y sin diferencias de esquema después. Sin variables de entorno nuevas.

## v1.5 — Salud de la mujer, carga y recuperación, plan propio, estudio y plataforma (9/10/2026)

**Salud de la mujer** (Recuperación → Salud de la mujer; perfil de mujer u opcional). Todo **cifrado**, **nunca se envía a la IA**, la entrenadora **no lo ve** (ni con permiso de recuperación) y no sale en el `.ics` ni en el informe. Son herramientas de **cribado y prudencia, no diagnósticos**: cada aviso remite a una valoración profesional.
- **Disponibilidad energética** de 7 días ((kcal ingeridas − kcal del ejercicio) / kg de masa libre de grasa) con aviso por debajo de un umbral editable (30 por defecto). Si faltan datos de comida, lo dice en vez de estimar.
- **Cribado de RED-S** cada 3 meses: 8 preguntas orientativas inspiradas en los dominios del LEAF-Q (no es el cuestionario validado).
- **Regla ausente o irregular** a partir de «Mi ciclo» (> 90 días sin regla, ciclos > 35 días seguidos), sin anticonceptivo hormonal.
- **Analíticas:** ferritina, hemoglobina, vitamina D y otros; tendencia, aviso de ferritina baja (umbral editable) y recordatorio cada N meses. Nunca recomienda dosis.
- **Suelo pélvico:** síntomas con un toque, propuesta de reducir impactos y rutina de activación.
- **Embarazo y posparto:** modo manual que bloquea el plan con IA y oculta los avisos de rendimiento que no aplican; **vuelta posparto por fases** con criterios (Goom 2019) y el alta médica como requisito.
- **El ciclo en el plan:** días previstos de regla o síntomas en el calendario (solo para ti) y sugerencia de mover un test o una competición que cae en esos días. Semana de descanso de la píldora.
- Recordatorio push discreto (opcional) para registrar la regla.

**Técnica, carga y recuperación**
- **Consistencia técnica** por sesión (media, mejor, coeficiente de variación, % de nulos) y dispersión de intentos.
- **Condiciones automáticas** (temperatura, viento, lluvia) de Open-Meteo según **Ajustes → Mi pista**; sin red no pasa nada.
- **Calentamiento de competición cronometrado** hacia atrás hasta la hora de la prueba, con vibración.
- **Monotonía y strain de Foster** con aviso, **índice Hooper**, **deuda de sueño** y **hidratación** con objetivo que sube con calor y sesión.
- **Importar VFC y sueño desde CSV** (HRV4Training, Elite HRV, Garmin…) con el mapeo de columnas guardado.
- **Vuelta tras lesión por fases** con criterios de paso; mientras dura, calla los avisos de carga que no tocan.

**Planificación y entreno**
- **Plan propio** sin PDF ni IA: crear, editar días con su tabla, duplicar semana y activar.
- **Mover o duplicar** sesiones planificadas (respeta el día del plan y avisa de las 48 h entre lanzamientos).
- **Tests físicos** (30 m, saltos, balón medicinal… y los tuyos) con historial y gráfica.
- **VBT manual:** velocidad por serie, perfil carga-velocidad con RM estimada y aviso de pérdida de velocidad.
- **Planificado frente a hecho** por ejercicio y tonelaje semanal; **plan del día imprimible**.

**Astras AI** (con consentimiento de IA)
- **Pregunta a tus datos de entreno:** responde con un resumen numérico calculado en el servidor; sin datos de salud.
- **Dictar la sesión:** el navegador transcribe (el audio no sale del móvil) y el texto se convierte en el formulario para revisar.

**Estudio**
- **Horario de clases y exámenes** con aviso si un entreno cae el día de un examen o la víspera; los exámenes salen en el calendario.
- **Pomodoro** que anota las horas por asignatura, con gráfica semanal.
- **Hábitos diarios** con rachas, marcados de un toque en Inicio.

**Finanzas, entrenadora y plataforma**
- **Becas y saldo de la temporada:** los ingresos deportivos (becas, premios, patrocinios) frente a los gastos, con previsión a fin de año.
- **Material:** jabalinas (cuentan solas los lanzamientos con su peso), clavos y zapatillas con vida útil y **aviso de reposición**; se enlaza con el gasto de compra.
- **Comentarios de la entrenadora** en las sesiones (con permiso de sesiones), push al atleta y respuesta. Nueva vista **Mis atletas** (`/coach`).
- **Estado del servidor** en Ajustes (solo admin): versión, BD, migraciones, cola, planificador, espacio de subidas y **última copia** (el servicio `backup` la registra en la BD).

**Arreglos**
- **Guardar parte de «Mis reglas», una tarea o una molestia podía devolver otros campos a su valor por defecto** (zod 4 aplica los `.default()` también en `.partial()`). Afectaba a la v1.4 instalada; ahora solo se guarda lo que se envía.
- Elegir una plantilla en «Nueva sesión» vuelve a cargar el formulario.

**Migraciones:** `v1_5_features` y `v1_5_backup_log`, **solo aditivas** (tablas nuevas y columnas opcionales). Probadas sobre una copia de una BD v1.4 con datos. **Sin variables obligatorias nuevas.**

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
