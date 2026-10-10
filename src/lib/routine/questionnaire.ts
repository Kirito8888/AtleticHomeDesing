// v1.7 · Creador de rutinas: el cuestionario. Todo con opciones cerradas o números (sin texto libre),
// para que la misma lista sirva a la UI, a la validación y al generador.
import { z } from "zod";

import { AVOID, BODY_AREAS, EQUIPMENT, LOCATIONS, MINUTES } from "@/lib/ai-plan/options";
import { isoDate } from "@/lib/dates";

const options = <const T extends string>(o: Record<T, string>) => o;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const SEXES = options({ F: "Mujer", M: "Hombre", X: "Prefiero no decirlo" });
export const EXPERIENCE = options({
  nunca: "Nunca he entrenado con regularidad",
  retomo: "Entrené antes y lo dejé (retomo)",
  menos1: "Menos de 1 año entrenando",
  "1a3": "Entre 1 y 3 años",
  mas3: "Más de 3 años",
});
export const ACTIVITY = options({
  sedentaria: "Sedentaria (casi todo sentada)",
  ligera: "Ligera (camino a diario)",
  activa: "Activa (trabajo de pie o deporte ocasional)",
  muy_activa: "Muy activa (deporte casi a diario)",
});

/** Preguntas de salud previas (inspiradas en el PAR-Q+). Cualquier «sí» → primero, valoración sanitaria. */
export const PARQ = options({
  corazon: "Un médico me ha dicho que tengo un problema de corazón o de tensión arterial",
  dolor_pecho: "Siento dolor en el pecho en reposo, en mi día a día o al hacer ejercicio",
  mareos: "Pierdo el equilibrio por mareos o he perdido el conocimiento en el último año",
  cronica: "Tengo otra enfermedad crónica diagnosticada (que no sea corazón ni tensión)",
  medicacion: "Tomo medicación para una enfermedad crónica",
  hueso_articulacion: "Tengo un problema de huesos, articulaciones o tejidos blandos que empeora al moverme",
  embarazo: "Estoy embarazada o he dado a luz en los últimos 6 meses",
});

export const GOALS_SHORT = options({
  empezar: "Empezar a moverme sin lesionarme",
  fuerza: "Ganar fuerza",
  resistencia: "Mejorar la resistencia",
  correr_5k: "Correr 5 km seguidos",
  perder_grasa: "Perder grasa",
  movilidad: "Ganar movilidad y aliviar molestias",
  salud: "Salud y energía en general",
});
export const GOALS_LONG = options({
  constancia: "Hacer del ejercicio un hábito",
  fuerza: "Ser claramente más fuerte",
  carrera: "Correr una carrera (10 km o más)",
  composicion: "Cambiar mi composición corporal",
  autonomia: "Mantener la autonomía y la forma al envejecer",
  competir: "Competir en mi deporte",
});
export const HORIZONS = [3, 6, 9, 12] as const;
export const SHORT_WEEKS = [4, 6, 8] as const;

/** Tests sencillos (todos opcionales). Unidades en la etiqueta. */
export const TESTS = {
  pushups: { label: "Flexiones seguidas (de rodillas cuentan)", unit: "rep", higherIsBetter: true, max: 200 },
  squats60: { label: "Sentadillas en 1 minuto", unit: "rep", higherIsBetter: true, max: 150 },
  plankSec: { label: "Plancha frontal aguantada", unit: "s", higherIsBetter: true, max: 900 },
  km1Sec: { label: "1 km corriendo o andando rápido", unit: "s", higherIsBetter: false, max: 3600 },
  walk6Meters: { label: "Metros andando en 6 minutos", unit: "m", higherIsBetter: true, max: 1500 },
  sitStand30: { label: "Levantarse de la silla en 30 s (sin manos)", unit: "rep", higherIsBetter: true, max: 60 },
} as const;
export type TestKey = keyof typeof TESTS;

const testSchema = z.object(Object.fromEntries((Object.keys(TESTS) as TestKey[]).map((k) => [k, z.number().min(0).max(TESTS[k].max).nullish()])) as Record<TestKey, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>);

export const routineAnswersSchema = z
  .object({
    sex: z.enum(keys(SEXES)),
    age: z.number().int().min(14).max(95),
    weightKg: z.number().min(30).max(250).nullish(),
    heightCm: z.number().min(120).max(230).nullish(),
    experience: z.enum(keys(EXPERIENCE)),
    activity: z.enum(keys(ACTIVITY)),
    sleepHours: z.number().min(3).max(12).nullish(),
    parq: z.array(z.enum(keys(PARQ))).max(7).default([]),
    tests: testSchema.default({}),
    shortGoal: z.enum(keys(GOALS_SHORT)),
    shortWeeks: z.number().int().refine((w) => (SHORT_WEEKS as readonly number[]).includes(w), "Semanas no válidas"),
    longGoal: z.enum(keys(GOALS_LONG)),
    horizonMonths: z.number().int().refine((m) => (HORIZONS as readonly number[]).includes(m), "Horizonte no válido"),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(6),
    minutes: z.number().int().refine((m) => (MINUTES as readonly number[]).includes(m), "Duración no válida"),
    location: z.enum(keys(LOCATIONS)),
    equipment: z.array(z.enum(keys(EQUIPMENT))).max(16).default([]),
    areas: z.array(z.enum(keys(BODY_AREAS))).max(17).default([]),
    avoid: z.array(z.enum(keys(AVOID))).max(7).default([]),
    startDate: isoDate,
  })
  .superRefine((r, ctx) => {
    if (new Set(r.weekdays).size !== r.weekdays.length) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Días repetidos" });
  });
export type RoutineAnswers = z.infer<typeof routineAnswersSchema>;
