// v1.6 · Salud de la mujer: patrón ciclo–rendimiento, predicción aprendida, salud ósea y hierro.
// Puro (sin BD). Todo se calcula en el servidor y solo lo ve su dueña; nunca va a la IA.
import { type CycleLogEntry, type CycleSettings, cycleLength, periodStarts } from "./cycle";
import type { HealthAlert } from "./women";

const DAY = 864e5;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Ciclos completos (de un inicio de regla al siguiente, 21–45 días). */
export function completedCycles(settings: Pick<CycleSettings, "lastStart"> | null, logs: CycleLogEntry[]): Array<{ start: string; length: number }> {
  const starts = periodStarts({ lastStart: settings?.lastStart ?? null }, logs);
  const out: Array<{ start: string; length: number }> = [];
  for (let i = 1; i < starts.length; i++) {
    const length = Math.round((ms(starts[i]) - ms(starts[i - 1])) / DAY);
    if (length >= 21 && length <= 45) out.push({ start: starts[i - 1], length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// W2 · Predicción aprendida de los días con síntomas
// ---------------------------------------------------------------------------
export const MIN_CYCLES = 3;

/**
 * Para cada día del ciclo (1 = primer día de regla), en qué proporción de sus ciclos
 * completos marcó síntomas ese día. Un día sin registro cuenta como «sin síntomas».
 * null si hay menos de 3 ciclos completos.
 */
export function learnedSymptomDays(settings: Pick<CycleSettings, "lastStart"> | null, logs: CycleLogEntry[]): Map<number, number> | null {
  const cycles = completedCycles(settings, logs);
  if (cycles.length < MIN_CYCLES) return null;
  const withSymptoms = new Set(logs.filter((l) => l.symptoms.length).map((l) => l.date));
  const counts = new Map<number, number>();
  for (const c of cycles) {
    for (let d = 1; d <= c.length; d++) if (withSymptoms.has(iso(ms(c.start) + (d - 1) * DAY))) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return new Map([...counts.entries()].map(([d, n]) => [d, r1(n / cycles.length)]));
}

/** Días previstos con síntomas según lo aprendido (para el calendario y la versión suave). */
export function learnedPrediction(
  settings: CycleSettings | null,
  logs: CycleLogEntry[],
  from: string,
  to: string,
  minProb: number,
): Array<{ date: string; prob: number }> | null {
  if (!settings || settings.hormonal === "si") return null;
  const learned = learnedSymptomDays(settings, logs);
  if (!learned) return null;
  const length = cycleLength(settings, logs);
  const last = periodStarts(settings, logs).at(-1);
  if (!last) return null;
  const out: Array<{ date: string; prob: number }> = [];
  for (let t = ms(from); t <= ms(to); t += DAY) {
    const since = Math.floor((t - ms(last)) / DAY);
    if (since < 0 || since > length * 1.5) continue;
    const d = (since % length) + 1;
    const prob = learned.get(d) ?? 0;
    if (prob >= minProb) out.push({ date: iso(t), prob });
  }
  return out;
}

// ---------------------------------------------------------------------------
// W1 · Tu patrón ciclo–rendimiento
// ---------------------------------------------------------------------------
export type PerfDay = { date: string; rpe?: number | null; strengthPct?: number | null; markPct?: number | null; readiness?: number | null };
export type Stat = { n: number; mean: number; low: number; high: number };
export type PerfMetric = "rpe" | "strengthPct" | "markPct" | "readiness";
export const PERF_LABEL: Record<PerfMetric, { label: string; unit: string; higherIsBetter: boolean }> = {
  rpe: { label: "RPE de la sesión", unit: "", higherIsBetter: false },
  strengthPct: { label: "Fuerza (1RM estimada del día / tu mejor)", unit: "%", higherIsBetter: true },
  markPct: { label: "Marcas (mejor del día / tu mejor)", unit: "%", higherIsBetter: true },
  readiness: { label: "Readiness", unit: "", higherIsBetter: true },
};

function stat(xs: number[]): Stat | null {
  if (xs.length < 3) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  const half = (1.96 * sd) / Math.sqrt(xs.length);
  return { n: xs.length, mean: r1(mean), low: r1(mean - half), high: r1(mean + half) };
}

export type CyclePerformance =
  | { ok: false; reason: string }
  | {
      ok: true;
      cycles: number;
      rows: Array<{ metric: PerfMetric; with: Stat; without: Stat; diff: number; clear: boolean }>;
    };

/**
 * Compara tus días con síntomas o regla (lo que registraste, no una fase genérica) con el resto.
 * «clear» = los intervalos al 95 % no se solapan; si se solapan, la diferencia puede ser casualidad.
 */
export function cyclePerformance(settings: Pick<CycleSettings, "lastStart"> | null, logs: CycleLogEntry[], days: PerfDay[]): CyclePerformance {
  const cycles = completedCycles(settings, logs).length;
  if (cycles < MIN_CYCLES) return { ok: false, reason: `Hacen falta ${MIN_CYCLES} ciclos completos registrados (llevas ${cycles}).` };
  const marked = new Set(logs.filter((l) => l.period || l.symptoms.length).map((l) => l.date));
  const rows: Extract<CyclePerformance, { ok: true }>["rows"] = [];
  for (const metric of Object.keys(PERF_LABEL) as PerfMetric[]) {
    const pick = (inSet: boolean) => days.filter((d) => marked.has(d.date) === inSet).flatMap((d) => (d[metric] != null ? [d[metric] as number] : []));
    const a = stat(pick(true));
    const b = stat(pick(false));
    if (!a || !b) continue;
    rows.push({ metric, with: a, without: b, diff: r1(a.mean - b.mean), clear: a.high < b.low || b.high < a.low });
  }
  if (!rows.length) return { ok: false, reason: "Aún no hay suficientes sesiones en días con y sin síntomas (al menos 3 de cada)." };
  return { ok: true, cycles, rows };
}

// ---------------------------------------------------------------------------
// W3 · Salud ósea (cribado de prudencia, no diagnóstico)
// ---------------------------------------------------------------------------
export type BoneInput = {
  stressFractures: number | null;
  calciumServings: number | null;
  vitaminD: number | null;
  amenorrhea: boolean;
  lowEa: boolean;
  impactSessions7d: number;
};
export type BoneResult = { level: "red" | "amber" | "ok"; reasons: string[] };

export function boneScreen(b: BoneInput, s: { calciumMin: number; vitDMin: number; boneImpactMin: number }): BoneResult {
  const reasons: string[] = [];
  const fractures = b.stressFractures ?? 0;
  const energy = b.amenorrhea || b.lowEa;
  if (fractures >= 2) reasons.push(`${fractures} fracturas de estrés previas`);
  else if (fractures === 1) reasons.push("una fractura de estrés previa");
  if (b.amenorrhea) reasons.push("regla ausente o muy irregular");
  if (b.lowEa) reasons.push("disponibilidad energética baja");
  if (b.calciumServings != null && b.calciumServings < s.calciumMin) reasons.push(`${b.calciumServings} raciones de calcio al día (objetivo ${s.calciumMin})`);
  if (b.vitaminD != null && b.vitaminD < s.vitDMin) reasons.push(`vitamina D ${b.vitaminD} ng/mL (por debajo de ${s.vitDMin})`);
  if (b.impactSessions7d < s.boneImpactMin) reasons.push(`${b.impactSessions7d} sesiones con impacto esta semana (objetivo ${s.boneImpactMin})`);
  const level: BoneResult["level"] = fractures >= 2 || (fractures >= 1 && energy) ? "red" : reasons.length ? "amber" : "ok";
  return { level, reasons };
}

export function boneAlert(r: BoneResult): HealthAlert | null {
  if (r.level === "ok") return null;
  return r.level === "red"
    ? {
        id: "bone-red",
        level: "warn",
        title: "Salud ósea: pide una valoración",
        message: `Se juntan ${r.reasons.join(", ")}. Es la combinación que más se asocia a nuevas fracturas de estrés en deportistas. Coméntalo con tu médica (puede valorar una densitometría) y no aumentes impactos hasta entonces.`,
      }
    : { id: "bone-amber", level: "info", title: "Salud ósea: a vigilar", message: `${r.reasons.join(", ")}. Pequeños cambios (calcio, vitamina D, saltos) protegen el hueso a largo plazo.` };
}

// ---------------------------------------------------------------------------
// W5 · Hierro en la dieta
// ---------------------------------------------------------------------------
export type IronEntry = { date: string; name: string; ironMg: number | null; ironRich: boolean };

/** Resumen de 7 días: mg conocidos (solo de productos que traen el dato) y días con alimentos ricos en hierro. */
export function ironWeek(entries: IronEntry[], today: string) {
  const from = iso(ms(today) - 6 * DAY);
  const week = entries.filter((e) => e.date >= from && e.date <= today);
  const rich = week.filter((e) => e.ironRich || (e.ironMg ?? 0) >= 2);
  const knownMg = week.reduce((a, e) => a + (e.ironMg ?? 0), 0);
  return {
    knownMg: r1(knownMg),
    daysWithRich: new Set(rich.map((e) => e.date)).size,
    richFoods: [...new Set(rich.map((e) => e.name))].slice(0, 8),
    /** Entradas sin dato de hierro: el total es un mínimo, no la ingesta real. */
    unknown: week.filter((e) => e.ironMg == null).length,
  };
}

export const IRON_TIPS = [
  "Acompaña el hierro con vitamina C (pimiento, cítricos, kiwi, tomate): se absorbe mejor.",
  "Separa el café y el té al menos 1 h de las comidas ricas en hierro.",
  "El hierro de carne, pescado y marisco se absorbe mejor que el de legumbres y verduras; con estas, la vitamina C importa más.",
  "No tomes suplementos de hierro por tu cuenta: la dosis y la pauta las decide tu médica según tu ferritina.",
];
