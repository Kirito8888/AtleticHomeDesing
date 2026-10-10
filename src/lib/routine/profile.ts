// v1.7 · Perfil a partir del cuestionario y proyección del progreso. Puro (sin BD).
// Las bandas y los ritmos de mejora son ORIENTATIVOS (valores típicos de la literatura de
// entrenamiento para población general); la app lo dice siempre al mostrarlos.
import { PARQ, type RoutineAnswers, TESTS, type TestKey } from "./questionnaire";

export type Level = "principiante" | "intermedio" | "avanzado";
export type Band = "bajo" | "medio" | "alto";

/**
 * Bandas de referencia por test (puntos de corte bajo/alto). Se ajustan por sexo y edad con factores
 * suaves; no son baremos clínicos. Para km1Sec (menos es mejor) los cortes van al revés.
 */
const CUTS: Record<TestKey, [number, number]> = {
  pushups: [10, 25],
  squats60: [25, 40],
  plankSec: [30, 90],
  km1Sec: [480, 330],
  walk6Meters: [450, 600],
  sitStand30: [12, 17],
};

function ageFactor(age: number) {
  return age < 30 ? 1 : age < 40 ? 0.92 : age < 50 ? 0.84 : age < 60 ? 0.75 : age < 70 ? 0.66 : 0.58;
}

export function testBand(key: TestKey, value: number, a: Pick<RoutineAnswers, "sex" | "age">): Band {
  const [low, high] = CUTS[key];
  // La fuerza de tren superior difiere más por sexo; en el resto, solo la edad
  const sexF = a.sex === "F" && key === "pushups" ? 0.6 : 1;
  if (TESTS[key].higherIsBetter) {
    const f = key === "sitStand30" ? 1 : ageFactor(a.age) * sexF;
    return value < low * f ? "bajo" : value >= high * f ? "alto" : "medio";
  }
  const f = 1 / ageFactor(a.age);
  return value > low * f ? "bajo" : value <= high * f ? "alto" : "medio";
}

export type Profile = {
  level: Level;
  /** Etiqueta de qué tipo de persona es, para el plan y la explicación. */
  archetype: string;
  bands: Partial<Record<TestKey, Band>>;
  reasons: string[];
  /** Bloqueo por salud (PAR-Q): no se genera rutina hasta tener valoración. */
  blocked: string[];
  bmi: number | null;
};

export function buildProfile(a: RoutineAnswers): Profile {
  const reasons: string[] = [];
  const bands: Partial<Record<TestKey, Band>> = {};
  for (const k of Object.keys(TESTS) as TestKey[]) {
    const v = a.tests[k];
    if (v != null) bands[k] = testBand(k, v, a);
  }
  const vals = Object.values(bands);
  const score = vals.length ? vals.reduce((s, b) => s + (b === "alto" ? 2 : b === "medio" ? 1 : 0), 0) / vals.length : null;

  let level: Level = a.experience === "nunca" || a.experience === "menos1" ? "principiante" : a.experience === "mas3" ? "avanzado" : "intermedio";
  if (a.experience === "retomo") reasons.push("Retomas: empiezas por debajo de lo que hacías y subes rápido (memoria muscular).");
  if (score != null) {
    if (score < 0.7 && level !== "principiante") {
      level = "principiante";
      reasons.push("Tus tests salen bajos para tu experiencia: empiezas con cargas de principiante.");
    } else if (score >= 1.6 && level === "principiante") {
      level = "intermedio";
      reasons.push("Tus tests salen altos: puedes empezar con un volumen intermedio.");
    }
  } else reasons.push("Sin tests: el nivel sale solo de tu experiencia. Hazlos para afinar la rutina y la proyección.");
  if (a.activity === "sedentaria" && level === "avanzado") level = "intermedio";

  const bmi = a.weightKg && a.heightCm ? Math.round((a.weightKg / (a.heightCm / 100) ** 2) * 10) / 10 : null;
  let archetype = "Persona activa que busca mejorar";
  if (a.age >= 60) archetype = "Persona mayor: fuerza y equilibrio para la autonomía";
  else if (a.experience === "nunca") archetype = "Empieza desde cero";
  else if (a.experience === "retomo") archetype = "Retoma tras un parón";
  else if (a.longGoal === "competir") archetype = "Deportista que compite";
  else if (a.shortGoal === "correr_5k" || a.longGoal === "carrera") archetype = "Corredora/or en progreso";
  if (a.areas.length) reasons.push(`Se evitan ejercicios que cargan: ${a.areas.length} zona(s) con molestias.`);
  if (a.sleepHours != null && a.sleepHours < 6.5) reasons.push("Duermes poco: el volumen sube más despacio (la recuperación manda).");
  if (a.age < 18) reasons.push("Menor de 18: sin cargas máximas; técnica y variedad primero.");

  return { level, archetype, bands, reasons, blocked: a.parq.map((p) => PARQ[p]), bmi };
}

// ---------------------------------------------------------------------------
// Proyección: rendimientos decrecientes. valor(t) = base ± base·g·(1 − e^(−t/τ))·adherencia
// g = mejora máxima relativa alcanzable en el horizonte (por nivel y test); τ = semanas hasta ~63 %.
// ---------------------------------------------------------------------------
const GAIN: Record<Level, number> = { principiante: 0.8, intermedio: 0.3, avanzado: 0.1 };
const TEST_GAIN: Record<TestKey, number> = { pushups: 1.2, squats60: 0.8, plankSec: 1.2, km1Sec: 0.35, walk6Meters: 0.25, sitStand30: 0.5 };
const TAU: Record<Level, number> = { principiante: 10, intermedio: 16, avanzado: 22 };

/** Factor de adherencia según los días por semana (3 días = referencia). */
export function frequencyFactor(daysPerWeek: number) {
  return [0, 0.45, 0.75, 1, 1.08, 1.12, 1.15][Math.min(6, Math.max(0, daysPerWeek))];
}

export type ProjectionPoint = { week: number; expected: number; low: number; high: number };

export function project(key: TestKey, base: number, level: Level, daysPerWeek: number, weeks: number, step = 2): ProjectionPoint[] {
  const better = TESTS[key].higherIsBetter;
  const g = GAIN[level] * TEST_GAIN[key] * frequencyFactor(daysPerWeek);
  // Las marcas de tiempo no pueden bajar sin límite: tope de mejora del 40 %
  const maxGain = better ? Infinity : 0.4;
  const at = (w: number, k: number) => {
    const rel = Math.min(maxGain, g * k * (1 - Math.exp(-w / TAU[level])));
    const v = better ? base * (1 + rel) : base * (1 - rel);
    return Math.round(v * 10) / 10;
  };
  const out: ProjectionPoint[] = [];
  for (let w = 0; w <= weeks; w += step) out.push({ week: w, expected: at(w, 1), low: better ? at(w, 0.55) : at(w, 1.35), high: better ? at(w, 1.35) : at(w, 0.55) });
  if (out[out.length - 1].week !== weeks) out.push({ week: weeks, expected: at(weeks, 1), low: better ? at(weeks, 0.55) : at(weeks, 1.35), high: better ? at(weeks, 1.35) : at(weeks, 0.55) });
  return out;
}

/** Semanas desde una fecha (para colocar los retests en la curva). */
export const weeksBetween = (from: string, to: string) => Math.max(0, Math.round(((Date.parse(to) - Date.parse(from)) / 864e5 / 7) * 10) / 10);
