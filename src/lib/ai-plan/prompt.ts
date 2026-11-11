import { EVENTS } from "@/lib/training/disciplines";
import { CITATIONS, formatCitation, PRESCRIPTION, type PrescriptionGoal, restLabel } from "@/lib/training/prescription";

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
  spacesLabel,
  spacesOf,
  STYLES,
  WEEKDAY_LABEL,
} from "./options";

/**
 * Prompt para Gemini. Solo lleva lo necesario para programar el entrenamiento:
 * ni nombre, ni email, ni fechas exactas, ni datos del ciclo menstrual (la
 * adaptación al ciclo se hace en local eligiendo la «versión suave» del día).
 */
const range = (r: readonly [number, number]) => `${r[0]}-${r[1]}`;
const GOAL_NAME: Record<PrescriptionGoal, string> = { fuerza: "fuerza", hipertrofia: "hipertrofia y salud general", resistencia_muscular: "resistencia muscular" };

/**
 * N7 · Pautas de referencia (solo lectura de `PRESCRIPTION` y `CITATIONS`; ninguna fórmula cambia): dosis por objetivo y nivel
 * con los ids de las citas que la respaldan y el catálogo con DOI. Texto fijo: sin datos de la usuaria.
 */
export function guidelinesText(): string {
  const used = new Set<string>();
  const rules = (Object.keys(PRESCRIPTION) as PrescriptionGoal[]).flatMap((g) =>
    (Object.keys(PRESCRIPTION[g]) as Array<keyof (typeof PRESCRIPTION)[PrescriptionGoal]>).map((lvl) => {
      const r = PRESCRIPTION[g][lvl];
      r.refs.forEach((x) => used.add(x));
      return `- ${GOAL_NAME[g]}, ${lvl}: ${range(r.weeklySets)} series semanales por grupo muscular, ${range(r.reps)} repeticiones, ${r.rir}, descanso ${restLabel(r.restSec)} [${r.refs.join(", ")}]`;
    }),
  );
  return ["Pautas de referencia (dosis habitual por objetivo y nivel; entre corchetes, ids de cita):", ...rules, "Citas:", ...CITATIONS.filter((c) => used.has(c.id)).map((c) => `- ${c.id}: ${formatCitation(c)}`)].join("\n");
}

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
- Fundamenta series, repeticiones, RIR y descanso de los ejercicios de fuerza en las pautas de referencia de abajo y, en "refs" de cada ejercicio, pon los ids de las citas en que te basas (máximo 4). Usa SOLO ids de la lista; si no aplica ninguna, deja "refs" vacío. No inventes citas, autores ni DOI.
- No des consejos médicos ni nutricionales.

${guidelinesText()}`;

export function buildPlanPrompt(r: PlanRequest, feedback?: string[]): string {
  const days = r.weekdays.map((wd) => {
    const spaces = spacesOf(r, wd) ?? [];
    const eq = [...allowedEquipment(spaces, r.equipment)].map((k) => `${k} (${EQUIPMENT[k]})`).join(", ");
    return `- weekday ${wd} (${WEEKDAY_LABEL[wd - 1]}): ${spacesLabel(spaces)}. Material permitido: ${eq}`;
  });
  const lines = [
    `Objetivo: ${GOALS[r.goal]}. Disciplina: ${DISCIPLINES[r.discipline]}${r.event && EVENTS[r.event] ? ` (prueba principal: ${EVENTS[r.event].label})` : ""}. Nivel: ${LEVELS[r.level]}. Edad: ${AGE_BANDS[r.ageBand]}.`,
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
export function buildSwapPrompt(params: { exercises: string[]; locations: readonly (keyof typeof LOCATIONS)[]; equipment: string[]; areas: string[]; avoid: string[] }) {
  return [
    `Sustituye estos ejercicios por equivalentes (mismo objetivo y volumen) que se puedan hacer en: ${spacesLabel(params.locations)}.`,
    `Material permitido: ${params.equipment.join(", ")}.`,
    params.areas.length ? `No cargar: ${params.areas.join(", ")}.` : "",
    params.avoid.length ? `Evitar: ${params.avoid.join(", ")}.` : "",
    "Ejercicios:",
    ...params.exercises.map((e) => `- ${e}`),
  ]
    .filter(Boolean)
    .join("\n");
}
