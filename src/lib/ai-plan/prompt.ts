import {
  AGE_BANDS,
  AVOID,
  allowedEquipment,
  BODY_AREAS,
  DISCIPLINES,
  EQUIPMENT,
  GOALS,
  INTENSITIES,
  LEVELS,
  LOCATIONS,
  type PlanRequest,
  STYLES,
  WEEKDAY_LABEL,
} from "./options";

/**
 * Prompt para Gemini. Solo lleva lo necesario para programar el entrenamiento:
 * ni nombre, ni email, ni fechas exactas, ni datos del ciclo menstrual (la
 * adaptación al ciclo se hace en local eligiendo la «versión suave» del día).
 */
export const PLAN_SYSTEM = `Eres un preparador físico titulado que diseña planes de entrenamiento seguros y progresivos en español de España.
Reglas obligatorias:
- Responde SOLO con el JSON del esquema. Nombres de ejercicio claros y comunes en español.
- Cada día: calentamiento específico, ejercicios y vuelta a la calma. La duración total no supera los minutos pedidos.
- Usa SOLO el material permitido para el sitio de ese día (campo "equipment" de cada ejercicio, con las claves dadas). "peso_corporal" siempre está permitido.
- Marca en "patterns" lo que implique cada ejercicio (saltos, carrera, impacto, sobre_cabeza, cargas_axiales, rotaciones, lanzamientos) y en "areas" las zonas que carga mucho. Nunca incluyas patrones que el usuario quiere evitar ni ejercicios que carguen sus zonas con molestias.
- Para cada ejercicio da hasta 3 alternativas con su material.
- Para cada día da una "light": versión suave (≈60 % del volumen, intensidad baja, sin impactos ni esfuerzos máximos).
- Principiantes: técnica antes que carga, sin tests de máximo, RIR ≥ 3. Nada de pliometría intensa si hay molestias en tobillo, rodilla o Aquiles.
- Fases ("phases"): suma de semanas = semanas pedidas. Si son 6 o más semanas, incluye una semana de descarga (deload=true) como mucho cada 4 semanas. "progression": +1 para subir volumen poco a poco, 0 mantener, -1 bajar (taper).
- Si hay competición objetivo, la semana anterior baja el volumen (taper) y mantiene la intensidad.
- La intensidad, en RPE o RIR (p. ej. "RIR 2") o con una descripción breve; usa %RM solo si es avanzado.
- No des consejos médicos ni nutricionales.`;

export function buildPlanPrompt(r: PlanRequest, feedback?: string[]): string {
  const days = r.weekdays.map((wd, i) => {
    const loc = r.dayLocations[i];
    const eq = [...allowedEquipment(loc, r.equipment)].map((k) => `${k} (${EQUIPMENT[k]})`).join(", ");
    return `- weekday ${wd} (${WEEKDAY_LABEL[wd - 1]}): ${LOCATIONS[loc]}. Material permitido: ${eq}`;
  });
  const lines = [
    `Objetivo: ${GOALS[r.goal]}. Disciplina: ${DISCIPLINES[r.discipline]}. Nivel: ${LEVELS[r.level]}. Edad: ${AGE_BANDS[r.ageBand]}.`,
    `Duración del plan: ${r.weeks} semanas. Minutos por sesión: ${r.minutes} como máximo.`,
    `Días de entrenamiento (${r.weekdays.length} por semana, usa exactamente estos weekday en cada fase):`,
    ...days,
    `Intensidad preferida: ${INTENSITIES[r.intensity]}. Estilo: ${STYLES[r.style]}.`,
    r.areas.length ? `Zonas con molestias (no cargarlas): ${r.areas.map((a) => `${a} (${BODY_AREAS[a]})`).join(", ")}.` : "Sin molestias declaradas.",
    r.avoid.length ? `Evitar: ${r.avoid.map((a) => `${a} (${AVOID[a]})`).join(", ")}.` : "Nada que evitar.",
    r.competitionWeek ? `Competición objetivo al final de la semana ${r.competitionWeek}.` : "Sin competición objetivo.",
  ];
  if (feedback?.length) {
    lines.push("", "Tu respuesta anterior no cumplía estas reglas; corrígelas:", ...feedback.map((f) => `- ${f}`));
  }
  return lines.join("\n");
}

/** Prompt para sustituir ejercicios de un día por otros que se puedan hacer con otro material. */
export function buildSwapPrompt(params: { exercises: string[]; location: keyof typeof LOCATIONS; equipment: string[]; areas: string[]; avoid: string[] }) {
  return [
    `Sustituye estos ejercicios por equivalentes (mismo objetivo y volumen) que se puedan hacer en: ${LOCATIONS[params.location]}.`,
    `Material permitido: ${params.equipment.join(", ")}.`,
    params.areas.length ? `No cargar: ${params.areas.join(", ")}.` : "",
    params.avoid.length ? `Evitar: ${params.avoid.join(", ")}.` : "",
    "Ejercicios:",
    ...params.exercises.map((e) => `- ${e}`),
  ]
    .filter(Boolean)
    .join("\n");
}
