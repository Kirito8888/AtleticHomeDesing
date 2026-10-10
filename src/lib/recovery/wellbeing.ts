// v1.7 · Bienestar: diario de sueño con cafeína e higiene, ánimo y estrés, escalas de dolor y función,
// movilidad según la fatiga por zona y respiración guiada. Puro (sin BD). Nada de esto es un
// diagnóstico: son registros y pautas de prudencia.
import { z } from "zod";

import { isoDate } from "@/lib/dates";
import type { FatigueZone } from "@/lib/training/zone-fatigue";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// 9 · Diario de sueño ------------------------------------------------------------------------------
export const SLEEP_HABITS = {
  pantallas: "Sin pantallas la última hora",
  horario: "Me acosté a mi hora de siempre",
  cena: "Cena ligera, 2 h o más antes",
  oscuridad: "Habitación oscura y fresca",
  alcohol: "Sin alcohol",
} as const;
export type SleepHabit = keyof typeof SLEEP_HABITS;

export const sleepEntrySchema = z.object({
  date: isoDate,
  bedtime: hhmm,
  wakeTime: hhmm,
  /** Minutos hasta dormirse y despertares. */
  latencyMin: z.number().int().min(0).max(240).nullish(),
  awakenings: z.number().int().min(0).max(20).nullish(),
  quality: z.number().int().min(1).max(5),
  caffeineMg: z.number().int().min(0).max(1500).default(0),
  lastCaffeine: hhmm.nullish(),
  habits: z.array(z.enum(Object.keys(SLEEP_HABITS) as [SleepHabit, ...SleepHabit[]])).max(5).default([]),
});
export type SleepEntry = z.infer<typeof sleepEntrySchema>;

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
/** Horas en la cama (cruza la medianoche). */
export function hoursInBed(bedtime: string, wakeTime: string) {
  const d = (toMin(wakeTime) - toMin(bedtime) + 1440) % 1440;
  return Math.round((d / 60) * 10) / 10;
}

/** Cafeína: vida media ≈ 5 h. Lo que queda al acostarse de lo tomado en la última toma (mg). */
export function caffeineAtBed(mg: number, lastCaffeine: string | null | undefined, bedtime: string) {
  if (!mg || !lastCaffeine) return 0;
  const h = ((toMin(bedtime) - toMin(lastCaffeine) + 1440) % 1440) / 60;
  return Math.round(mg * Math.pow(0.5, h / 5));
}

/** Avisos sencillos para la noche siguiente. */
export function sleepTips(e: SleepEntry): string[] {
  const out: string[] = [];
  const left = caffeineAtBed(e.caffeineMg, e.lastCaffeine, e.bedtime);
  if (left >= 50) out.push(`Al acostarte aún te quedaban ~${left} mg de cafeína: prueba a tomar la última antes de las 14:00.`);
  if (hoursInBed(e.bedtime, e.wakeTime) < 7.5) out.push("Menos de 7,5 h en la cama: es difícil dormir 7 h así.");
  if ((e.latencyMin ?? 0) > 30) out.push("Tardaste más de 30 min en dormirte: rutina de desconexión y levantarte si no te duermes.");
  const missing = (Object.keys(SLEEP_HABITS) as SleepHabit[]).filter((h) => !e.habits.includes(h));
  if (missing.length >= 3) out.push(`Hábitos que faltaron: ${missing.map((h) => SLEEP_HABITS[h].toLowerCase()).join(", ")}.`);
  return out;
}

// 14 · Ánimo y estrés ------------------------------------------------------------------------------
export const moodEntrySchema = z.object({
  date: isoDate,
  mood: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5).nullish(),
});
export type MoodEntry = z.infer<typeof moodEntrySchema>;

/** Media de 7 días frente a las 3 semanas anteriores; aviso suave si el ánimo cae o el estrés sube mucho. */
export function moodTrend(rows: MoodEntry[], today: string) {
  const day = (d: string) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const last = rows.filter((r) => day(r.date) >= 0 && day(r.date) < 7);
  const prev = rows.filter((r) => day(r.date) >= 7 && day(r.date) < 28);
  const t = { mood: avg(last.map((r) => r.mood)), stress: avg(last.map((r) => r.stress)), moodPrev: avg(prev.map((r) => r.mood)), stressPrev: avg(prev.map((r) => r.stress)), n: last.length };
  const alerts: string[] = [];
  if (t.n >= 3 && t.mood != null && t.mood <= 2) alerts.push("Llevas varios días con el ánimo bajo. Habla con alguien de confianza y, si sigue, pide ayuda profesional (en España, la línea 024 atiende 24 h).");
  if (t.n >= 3 && t.stress != null && t.stressPrev != null && t.stress - t.stressPrev >= 1) alerts.push("Tu estrés de esta semana es más alto que el de las anteriores: valora bajar algo la carga de entreno.");
  return { ...t, alerts };
}

// 10 · Escalas -----------------------------------------------------------------------------------
/**
 * Brazo y hombro: escala propia de Atlenza (no es un cuestionario validado ni reproduce ninguno).
 * 11 preguntas de 1 a 5; puntuación = (media − 1) × 25, de 0 (sin limitación) a 100, con al menos 10
 * respondidas. El identificador interno «QUICKDASH» se mantiene por compatibilidad con los datos.
 * Para uso clínico, usa con tu profesional un cuestionario validado.
 */
export const QUICKDASH_ITEMS = [
  "Abrir un bote nuevo o apretado",
  "Tareas domésticas duras (limpiar suelos, paredes)",
  "Llevar una bolsa de la compra o un maletín",
  "Lavarte la espalda",
  "Usar un cuchillo para cortar comida",
  "Actividades de ocio con fuerza o impacto en brazo, hombro o mano",
  "¿Te ha limitado en tus actividades sociales?",
  "¿Te ha limitado en el trabajo o el estudio?",
  "Dolor de brazo, hombro o mano",
  "Hormigueo en brazo, hombro o mano",
  "Dificultad para dormir por el dolor",
] as const;
export function quickDashScore(answers: Array<number | null>): number | null {
  const v = answers.filter((a): a is number => a != null && a >= 1 && a <= 5);
  if (v.length < 10) return null;
  return Math.round(((v.reduce((a, b) => a + b, 0) / v.length - 1) * 25) * 10) / 10;
}

/**
 * Tendón de Aquiles: escala propia de Atlenza, 8 preguntas de 0 a 10 (10 = sin problema), escaladas
 * a 0-100. No es ni reproduce un cuestionario validado: sirve para ver tu tendencia.
 */
export const ACHILLES_ITEMS = [
  "Rigidez del Aquiles al levantarte (10 = ninguna)",
  "Dolor al estirar el Aquiles a fondo (10 = ninguno)",
  "Dolor tras caminar 30 min en llano (10 = ninguno)",
  "Dolor al bajar escaleras a ritmo normal (10 = ninguno)",
  "Dolor en 10 elevaciones de talón a una pierna (10 = ninguno)",
  "Saltos a una pierna sin dolor (10 = diez o más)",
  "Puedes hacer deporte o actividad física (10 = a tope)",
  "Puedes entrenar sin dolor el tiempo que quieres (10 = sí)",
] as const;
export function achillesScore(answers: Array<number | null>): number | null {
  const v = answers.filter((a): a is number => a != null && a >= 0 && a <= 10);
  if (v.length < ACHILLES_ITEMS.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / (ACHILLES_ITEMS.length * 10)) * 100);
}

export const scaleEntrySchema = z.discriminatedUnion("scale", [
  z.object({ scale: z.literal("EVA"), date: isoDate, area: z.string().max(40), score: z.number().min(0).max(10) }),
  z.object({ scale: z.literal("QUICKDASH"), date: isoDate, answers: z.array(z.number().int().min(1).max(5).nullable()).length(QUICKDASH_ITEMS.length) }),
  z.object({ scale: z.literal("ACHILLES"), date: isoDate, answers: z.array(z.number().int().min(0).max(10).nullable()).length(ACHILLES_ITEMS.length) }),
]);
export type ScaleEntry = z.infer<typeof scaleEntrySchema>;

export function scaleScore(e: ScaleEntry): { score: number | null; label: string; higherIsBetter: boolean } {
  if (e.scale === "EVA") return { score: e.score, label: `Dolor (EVA) ${e.area}`, higherIsBetter: false };
  if (e.scale === "QUICKDASH") return { score: quickDashScore(e.answers), label: "Brazo, hombro y mano (escala propia)", higherIsBetter: false };
  return { score: achillesScore(e.answers), label: "Aquiles (escala propia)", higherIsBetter: true };
}

// 11 · Movilidad sugerida por zona ---------------------------------------------------------------
export const MOBILITY: Record<FatigueZone, string[]> = {
  hombro: ["Dislocaciones con pica o goma (2×10)", "Rotación externa con goma (2×15)", "Apertura de pecho en pared (2×30 s)"],
  codo: ["Excéntricos de muñeca (2×15)", "Estiramiento de flexores del antebrazo (2×30 s)", "Pronosupinación con martillo ligero (2×12)"],
  espalda: ["Gato-camello (2×10)", "Rotaciones torácicas en el suelo (2×8 por lado)", "Puente de glúteo (2×12)"],
  cadera: ["90/90 de cadera (2×6 por lado)", "Estiramiento de flexores de cadera (2×30 s)", "Clamshell con goma (2×15)"],
  rodilla: ["Sentadilla isométrica en pared (3×30 s)", "Movilidad de tobillo en pared (2×10)", "Estiramiento de cuádriceps de pie (2×30 s)"],
  tobillo: ["Movilidad de tobillo en pared (2×10)", "Elevaciones de talón lentas (2×15)", "Equilibrio a una pierna (3×30 s)"],
};

/** Zonas con fatiga ≥ umbral en la última sesión → 2-3 ejercicios de movilidad para cada una. */
export function mobilityFor(zoneFatigue: Partial<Record<FatigueZone, number>> | null, threshold: number) {
  return (Object.entries(zoneFatigue ?? {}) as Array<[FatigueZone, number]>)
    .filter(([, v]) => v >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([zone, value]) => ({ zone, value, exercises: MOBILITY[zone] }));
}

// 13 · Respiración guiada ------------------------------------------------------------------------
export const BREATHING = {
  caja: { label: "Respiración en caja (4-4-4-4)", phases: [["Inhala", 4], ["Mantén", 4], ["Exhala", 4], ["Mantén", 4]] },
  "4-7-8": { label: "4-7-8 para dormir", phases: [["Inhala", 4], ["Mantén", 7], ["Exhala", 8]] },
  coherente: { label: "Coherencia (5,5 por minuto)", phases: [["Inhala", 5.5], ["Exhala", 5.5]] },
  activacion: { label: "Activación antes de competir", phases: [["Inhala", 3], ["Exhala", 2]] },
} as const satisfies Record<string, { label: string; phases: ReadonlyArray<readonly [string, number]> }>;
export type BreathingKey = keyof typeof BREATHING;

/** Fase y segundos que quedan en el instante `t` (segundos desde el inicio). */
export function breathingPhase(key: BreathingKey, t: number) {
  const ph = BREATHING[key].phases;
  const cycle = ph.reduce((a, [, s]) => a + s, 0);
  let x = t % cycle;
  for (const [index, [name, s]] of ph.entries()) {
    if (x < s) return { name, index, prev: ph[(index + ph.length - 1) % ph.length][0], remaining: Math.ceil(s - x), progress: x / s, cycles: Math.floor(t / cycle) };
    x -= s;
  }
  return { name: ph[0][0], index: 0, prev: ph[ph.length - 1][0], remaining: ph[0][1], progress: 0, cycles: Math.floor(t / cycle) };
}
