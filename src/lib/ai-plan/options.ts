import { z } from "zod";

/**
 * Opciones del cuestionario «Crear mi planificación». Todo se responde con
 * desplegables y chips (sin escribir): estas listas son la única fuente de
 * verdad para la UI, la validación y el prompt.
 */
const options = <const T extends string>(o: Record<T, string>) => o;

export const GOALS = options({
  fuerza: "Ganar fuerza",
  potencia: "Potencia y velocidad",
  resistencia: "Resistencia",
  competicion: "Preparar una competición",
  salud: "Salud y forma",
  recomposicion: "Perder grasa / ganar músculo",
  vuelta_lesion: "Volver tras una lesión",
});

export const DISCIPLINES = options({
  general: "General",
  lanzamientos: "Lanzamientos",
  saltos: "Saltos",
  velocidad: "Velocidad / vallas",
  fondo: "Medio fondo / fondo",
});

export const LEVELS = options({
  principiante: "Principiante (menos de 1 año entrenando)",
  intermedio: "Intermedio (1-3 años)",
  avanzado: "Avanzado (más de 3 años)",
});

export const AGE_BANDS = options({
  "u18": "Menos de 18",
  "18-29": "18-29",
  "30-39": "30-39",
  "40-49": "40-49",
  "50-59": "50-59",
  "60+": "60 o más",
});

export const LOCATIONS = options({
  gimnasio: "Gimnasio",
  casa: "Casa",
  pista: "Pista de atletismo",
  parque: "Parque / calle",
  piscina: "Piscina",
  viaje: "De viaje / hotel",
});

export const EQUIPMENT = options({
  peso_corporal: "Peso corporal",
  mancuernas: "Mancuernas",
  barra_discos: "Barra y discos",
  kettlebell: "Kettlebell",
  gomas: "Gomas elásticas",
  trx: "TRX / anillas",
  banco: "Banco",
  barra_dominadas: "Barra de dominadas",
  cajon: "Cajón",
  balon_medicinal: "Balón medicinal",
  comba: "Comba",
  bici_cinta: "Bici o cinta",
  implementos: "Implementos de lanzamiento",
  maquinas: "Máquinas de gimnasio",
  pista: "Pista",
  piscina: "Piscina",
});

/** Lo que se da por hecho en cada sitio (además de lo que marque el usuario). */
export const LOCATION_EQUIPMENT: Record<Location, Equipment[]> = {
  gimnasio: ["mancuernas", "barra_discos", "kettlebell", "gomas", "banco", "barra_dominadas", "cajon", "balon_medicinal", "bici_cinta", "maquinas", "trx"],
  pista: ["pista"],
  piscina: ["piscina"],
  casa: [],
  parque: [],
  viaje: [],
};

export const AVOID = options({
  saltos: "Saltos",
  carrera: "Carrera / esprints",
  impacto: "Impactos (cualquier salto o carrera)",
  sobre_cabeza: "Brazos por encima de la cabeza",
  cargas_axiales: "Carga sobre la espalda (sentadilla con barra…)",
  rotaciones: "Rotaciones con carga",
  lanzamientos: "Lanzamientos",
});

export const BODY_AREAS = options({
  HEAD_NECK: "Cabeza / cuello",
  SHOULDER: "Hombro",
  ELBOW: "Codo",
  WRIST_HAND: "Muñeca / mano",
  CHEST: "Pecho",
  UPPER_BACK: "Espalda alta",
  LOWER_BACK: "Zona lumbar",
  ABDOMEN: "Abdomen",
  HIP_GROIN: "Cadera / ingle",
  GLUTE: "Glúteo",
  HAMSTRING: "Isquios",
  QUADRICEPS: "Cuádriceps",
  KNEE: "Rodilla",
  CALF: "Gemelo",
  ACHILLES: "Aquiles",
  ANKLE: "Tobillo",
  FOOT: "Pie",
});

export const INTENSITIES = options({ suave: "Suave", media: "Media", alta: "Alta" });
export const STYLES = options({ series: "Por series (descanso completo)", circuito: "En circuito", mixto: "Mixto" });

/** Preguntas de seguridad previas (estilo PAR-Q). Cualquiera marcada → no se genera el plan. */
export const SAFETY = options({
  dolor_pecho: "Dolor en el pecho al hacer esfuerzo o en reposo",
  mareos: "Mareos o pérdidas de conocimiento",
  corazon: "Un médico me ha dicho que tengo un problema de corazón",
  embarazo: "Embarazo o parto en los últimos 6 meses",
  cirugia: "Cirugía en los últimos 6 meses",
});

export const MINUTES = [30, 45, 60, 75, 90, 120] as const;
export const WEEKS = [4, 6, 8, 12] as const;
export const WEEKDAY_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

export type Goal = keyof typeof GOALS;
export type Location = keyof typeof LOCATIONS;
export type Equipment = keyof typeof EQUIPMENT;
export type Avoid = keyof typeof AVOID;
export type Area = keyof typeof BODY_AREAS;

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** Respuestas del cuestionario. Ningún campo de texto libre. */
export const planRequestSchema = z
  .object({
    goal: z.enum(keys(GOALS)),
    discipline: z.enum(keys(DISCIPLINES)),
    level: z.enum(keys(LEVELS)),
    ageBand: z.enum(keys(AGE_BANDS)),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    minutes: z.number().int().refine((m) => (MINUTES as readonly number[]).includes(m), "Duración no válida"),
    weeks: z.number().int().refine((w) => (WEEKS as readonly number[]).includes(w), "Semanas no válidas"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Sitio de cada día elegido, en el mismo orden que `weekdays`. */
    dayLocations: z.array(z.enum(keys(LOCATIONS))).min(1).max(7),
    equipment: z.array(z.enum(keys(EQUIPMENT))).max(16).default([]),
    areas: z.array(z.enum(keys(BODY_AREAS))).max(17).default([]),
    avoid: z.array(z.enum(keys(AVOID))).max(7).default([]),
    intensity: z.enum(keys(INTENSITIES)),
    style: z.enum(keys(STYLES)),
    safety: z.array(z.enum(keys(SAFETY))).max(5).default([]),
    /** Competición objetivo: semanas desde el inicio (no se envía su nombre). */
    competitionWeek: z.number().int().min(1).max(12).nullish(),
  })
  .superRefine((r, ctx) => {
    if (new Set(r.weekdays).size !== r.weekdays.length) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Días repetidos" });
    if (r.dayLocations.length !== r.weekdays.length) ctx.addIssue({ code: "custom", path: ["dayLocations"], message: "Indica dónde entrenas cada día" });
    if (r.competitionWeek && r.competitionWeek > r.weeks) ctx.addIssue({ code: "custom", path: ["competitionWeek"], message: "La competición cae fuera del plan" });
  });

export type PlanRequest = z.infer<typeof planRequestSchema>;

/** Material disponible un día concreto: lo marcado + lo propio del sitio + peso corporal. */
export function allowedEquipment(location: Location, chosen: readonly Equipment[]): Set<Equipment> {
  return new Set<Equipment>(["peso_corporal", ...chosen, ...LOCATION_EQUIPMENT[location]]);
}

/** Sitio de cada día de la semana elegido. */
export function locationOf(r: Pick<PlanRequest, "weekdays" | "dayLocations">, weekday: number): Location | null {
  const i = r.weekdays.indexOf(weekday);
  return i >= 0 ? r.dayLocations[i] : null;
}
