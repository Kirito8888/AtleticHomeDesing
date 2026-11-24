/**
 * v3.2 · Bloque M (V3-N01): gasto energético adaptativo. **Determinista, local y sin IA.**
 *
 * Idea (balance energético): si comes de media I kcal/día y tu peso tendencia cambia S kg/día,
 * tu gasto es G ≈ I − S × 7700. Se calcula con lo que registras, no con fórmulas de población.
 *
 * Cautelas que el código impone:
 * - «Aún calibrando» sin al menos 21 días de historia, 14 días de comida completos y 6 pesajes que
 *   cubran 14 días: nunca se inventa un número.
 * - Los días de comida que parecen incompletos (menos del 60 % de la mediana o < 800 kcal) no cuentan:
 *   un día a medio anotar bajaría el gasto y llevaría a proponer comer menos.
 * - La tendencia del peso es una recta por mínimos cuadrados (no el último pesaje), con su margen.
 * - El borrador semanal cambia como mucho ±150 kcal respecto al objetivo actual, el déficit nunca pasa de
 *   300 kcal/día y el superávit de 250, y a menores de 18 años solo se les propone mantener.
 */

/** kcal por kg de cambio de peso (aproximación estándar; el cuerpo real varía [Probable]). */
export const KCAL_PER_KG = 7700;
export const WINDOW_DAYS = 28;
export const MIN_HISTORY_DAYS = 21;
export const MIN_INTAKE_DAYS = 14;
export const MIN_WEIGHINS = 6;
export const MIN_WEIGH_SPAN_DAYS = 14;
/** Un día con menos que esto (o que el 60 % de tu mediana) se toma como anotado a medias. */
export const MIN_DAY_KCAL = 800;
export const INCOMPLETE_FRACTION = 0.6;
/** Resultados fuera de aquí indican datos incoherentes: se muestra el aviso, no el número. */
export const PLAUSIBLE = { min: 1200, max: 6000 } as const;

export const MAX_WEEKLY_CHANGE = 150;
export const MAX_DEFICIT = 300;
export const MAX_SURPLUS = 250;

export type EnergyGoal = "maintain" | "lose" | "gain";
export const ENERGY_GOAL_LABEL: Record<EnergyGoal, string> = {
  maintain: "Mantener el peso",
  lose: "Bajar despacio",
  gain: "Subir despacio",
};
const OFFSET: Record<EnergyGoal, number> = { maintain: 0, lose: -MAX_DEFICIT, gain: MAX_SURPLUS };

export type DayInput = { day: string; kcal: number | null; weightKg: number | null };

export type Calibrating = {
  status: "calibrating";
  reasons: string[];
  /** Progreso de cada requisito, para enseñarlo («12 de 14 días de comida»). */
  progress: { historyDays: number; intakeDays: number; weighIns: number; weighSpanDays: number };
};
export type Incoherent = { status: "incoherent"; reason: string };
export type Estimate = {
  status: "ok";
  /** Gasto estimado (kcal/día), redondeado a 10. */
  kcal: number;
  /** Margen aproximado (± kcal/día) por la dispersión del peso. */
  marginKcal: number;
  avgIntakeKcal: number;
  /** Cambio de peso de la tendencia (kg/semana; negativo = bajando). */
  weeklyChangeKg: number;
  trendWeightKg: number;
  intakeDays: number;
  excludedDays: number;
  weighIns: number;
};
export type ExpenditureResult = Calibrating | Incoherent | Estimate;

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const round10 = (n: number) => Math.round(n / 10) * 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Recta por mínimos cuadrados: pendiente, valor al final y error típico de la pendiente. */
export function linearTrend(points: Array<{ x: number; y: number }>): { slope: number; intercept: number; slopeSe: number } {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const sse = points.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const slopeSe = n > 2 && sxx ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  return { slope, intercept, slopeSe };
}

/** Días de comida que cuentan: los que no parecen anotados a medias. */
export function completeIntakeDays(days: DayInput[]): { kept: DayInput[]; excluded: number } {
  const logged = days.filter((d) => d.kcal != null && d.kcal > 0);
  if (!logged.length) return { kept: [], excluded: 0 };
  const floor = Math.max(MIN_DAY_KCAL, INCOMPLETE_FRACTION * median(logged.map((d) => d.kcal!)));
  const kept = logged.filter((d) => d.kcal! >= floor);
  return { kept, excluded: logged.length - kept.length };
}

/**
 * Gasto estimado con los días dados (los últimos `WINDOW_DAYS`, sin hoy, que aún no ha terminado).
 * `historyDays`: días desde el primer registro (comida o peso) de la usuaria, para el mínimo de 3 semanas.
 */
export function estimateExpenditure(days: DayInput[], historyDays: number): ExpenditureResult {
  const { kept, excluded } = completeIntakeDays(days);
  const weights = days.filter((d) => d.weightKg != null && d.weightKg > 0).map((d) => ({ x: dayNum(d.day), y: d.weightKg! }));
  const span = weights.length ? Math.max(...weights.map((w) => w.x)) - Math.min(...weights.map((w) => w.x)) : 0;
  const progress = { historyDays, intakeDays: kept.length, weighIns: weights.length, weighSpanDays: span };
  const reasons: string[] = [];
  if (historyDays < MIN_HISTORY_DAYS) reasons.push(`Hacen falta 3 semanas de registros (llevas ${historyDays} días).`);
  if (kept.length < MIN_INTAKE_DAYS) reasons.push(`Hacen falta ${MIN_INTAKE_DAYS} días de comida completos en las últimas 4 semanas (tienes ${kept.length}).`);
  if (weights.length < MIN_WEIGHINS || span < MIN_WEIGH_SPAN_DAYS)
    reasons.push(`Hacen falta ${MIN_WEIGHINS} pesajes repartidos en al menos 2 semanas (tienes ${weights.length} en ${span} días).`);
  if (reasons.length) return { status: "calibrating", reasons, progress };

  const avgIntake = kept.reduce((a, d) => a + d.kcal!, 0) / kept.length;
  const trend = linearTrend(weights);
  const kcal = avgIntake - trend.slope * KCAL_PER_KG;
  if (!Number.isFinite(kcal) || kcal < PLAUSIBLE.min || kcal > PLAUSIBLE.max) {
    return { status: "incoherent", reason: "Con estos datos el gasto sale fuera de lo razonable. Suele ser un pesaje mal escrito o comidas sin anotar: revísalos y vuelve en unos días." };
  }
  const lastX = Math.max(...weights.map((w) => w.x));
  return {
    status: "ok",
    kcal: round10(kcal),
    marginKcal: Math.max(50, round10(1.96 * trend.slopeSe * KCAL_PER_KG)),
    avgIntakeKcal: Math.round(avgIntake),
    weeklyChangeKg: Math.round(trend.slope * 7 * 100) / 100,
    trendWeightKg: Math.round((trend.intercept + trend.slope * lastX) * 10) / 10,
    intakeDays: kept.length,
    excludedDays: excluded,
    weighIns: weights.length,
  };
}

export type GoalMacros = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type Draft =
  | { status: "none"; reason: string }
  | {
      status: "draft";
      /** kcal a los que apunta el objetivo elegido (gasto ± margen de la meta, con topes). */
      targetKcal: number;
      /** Lo que se propone esta semana (como mucho ±150 kcal sobre el objetivo actual). */
      goal: GoalMacros;
      capped: boolean;
      note: string | null;
    };

/**
 * Borrador semanal del objetivo. Mantiene la proteína y la grasa del objetivo actual y mueve los hidratos;
 * sin objetivo, parte de 1,6 g/kg de proteína y 1 g/kg de grasa. Nunca baja la grasa ni la proteína.
 */
export function weeklyDraft(input: { estimate: Estimate; current: GoalMacros | null; goal: EnergyGoal; age: number | null }): Draft {
  const { estimate, current } = input;
  const minor = input.age != null && input.age < 18;
  const goal: EnergyGoal = minor && input.goal !== "maintain" ? "maintain" : input.goal;
  const note = minor && input.goal !== "maintain" ? "Antes de los 18 años solo se propone mantener: crecer y entrenar necesitan energía. Si quieres cambiar de peso, hazlo con un profesional." : null;
  const targetKcal = round10(estimate.kcal + OFFSET[goal]);
  const from = current?.kcal ?? targetKcal;
  const delta = targetKcal - from;
  const step = Math.max(-MAX_WEEKLY_CHANGE, Math.min(MAX_WEEKLY_CHANGE, delta));
  const kcal = round10(from + step);
  if (current && Math.abs(kcal - current.kcal) < 50) return { status: "none", reason: "Tu objetivo actual ya encaja con lo estimado: no hace falta cambiarlo esta semana." };
  const w = estimate.trendWeightKg;
  const proteinG = current?.proteinG ?? Math.round(1.6 * w);
  const fatG = current?.fatG ?? Math.round(1 * w);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { status: "draft", targetKcal, goal: { kcal, proteinG, carbsG, fatG }, capped: step !== delta, note };
}
