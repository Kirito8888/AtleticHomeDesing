// Análisis de jabalina (v1.6). Puro. Con pocos datos, lo dice en vez de inventar.
import { z } from "zod";

import { isoDate } from "@/lib/dates";

export type ThrowSession = {
  date: string;
  implementWeightG: number | null;
  isCompetition: boolean;
  cue: string | null;
  marks: number[];
  conditions: { tempC: number | null; windMs: number | null } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const best = (s: ThrowSession) => Math.max(...s.marks);
const days = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;

// 1 · Claves técnicas ----------------------------------------------------------
/** Media de las marcas de las sesiones con cada clave, frente a tu media de entreno del mismo implemento. */
export function cueStats(sessions: ThrowSession[]) {
  const train = sessions.filter((s) => !s.isCompetition && s.marks.length);
  const byImpl = new Map<number | null, number[]>();
  for (const s of train) byImpl.set(s.implementWeightG, [...(byImpl.get(s.implementWeightG) ?? []), mean(s.marks)]);
  const base = new Map([...byImpl].map(([k, v]) => [k, mean(v)]));
  const by = new Map<string, number[]>();
  for (const s of train) {
    const cue = s.cue?.trim().toLowerCase();
    if (!cue) continue;
    // Diferencia frente a la media del implemento (para comparar sesiones con pesos distintos)
    by.set(cue, [...(by.get(cue) ?? []), mean(s.marks) - base.get(s.implementWeightG)!]);
  }
  return [...by]
    .map(([cue, diffs]) => ({ cue, sessions: diffs.length, diffM: r2(mean(diffs)) }))
    .sort((a, b) => b.diffM - a.diffM);
}

// 2 · Equivalencia entre implementos -------------------------------------------
/**
 * Relación entre pesos: mediana de (mejor marca con un peso / mejor con el de referencia)
 * en los meses en que lanzaste con los dos. Sin meses en común, no la da.
 */
export function implementEquivalence(sessions: ThrowSession[], refG: number) {
  const byMonth = new Map<string, Map<number, number>>();
  for (const s of sessions) {
    if (!s.implementWeightG || !s.marks.length) continue;
    const m = s.date.slice(0, 7);
    const row = byMonth.get(m) ?? new Map<number, number>();
    row.set(s.implementWeightG, Math.max(row.get(s.implementWeightG) ?? 0, best(s)));
    byMonth.set(m, row);
  }
  const weights = [...new Set(sessions.flatMap((s) => (s.implementWeightG && s.implementWeightG !== refG ? [s.implementWeightG] : [])))].sort((a, b) => a - b);
  return weights.map((g) => {
    const ratios = [...byMonth.values()].flatMap((row) => (row.has(g) && row.has(refG) ? [row.get(g)! / row.get(refG)!] : [])).sort((a, b) => a - b);
    const median = ratios.length ? ratios[Math.floor((ratios.length - 1) / 2)] + (ratios.length % 2 ? 0 : (ratios[ratios.length / 2] - ratios[ratios.length / 2 - 1]) / 2) : null;
    return { weightG: g, months: ratios.length, ratio: median == null ? null : Math.round(median * 1000) / 1000 };
  });
}

/** Mejor marca por mes de cada implemento (progresión). */
export function progressionByImplement(sessions: ThrowSession[]) {
  const out = new Map<number | null, Map<string, number>>();
  for (const s of sessions) {
    if (!s.marks.length) continue;
    const m = s.date.slice(0, 7);
    const row = out.get(s.implementWeightG) ?? new Map<string, number>();
    row.set(m, Math.max(row.get(m) ?? 0, best(s)));
    out.set(s.implementWeightG, row);
  }
  return [...out].map(([weightG, months]) => ({ weightG, months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, markM]) => ({ month, markM })) }));
}

// 3 · Marcas y condiciones ---------------------------------------------------------
/**
 * ¿Día bueno o progreso? Residuo = mejor marca de la sesión − media de las 5 sesiones
 * anteriores con el mismo implemento; se agrupa por viento y temperatura.
 */
export function conditionsEffect(sessions: ThrowSession[]) {
  const sorted = sessions.filter((s) => s.marks.length && !s.isCompetition).sort((a, b) => a.date.localeCompare(b.date));
  const rows: Array<{ residual: number; windMs: number | null; tempC: number | null }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted.slice(0, i).filter((p) => p.implementWeightG === sorted[i].implementWeightG).slice(-5);
    if (prev.length < 3 || !sorted[i].conditions) continue;
    rows.push({ residual: best(sorted[i]) - mean(prev.map(best)), windMs: sorted[i].conditions!.windMs, tempC: sorted[i].conditions!.tempC });
  }
  const bucket = <T,>(label: string, pick: (r: (typeof rows)[number]) => T | null, test: (v: T) => boolean) => {
    const xs = rows.filter((r) => pick(r) != null && test(pick(r)!)).map((r) => r.residual);
    return { label, n: xs.length, residualM: xs.length >= 3 ? r2(mean(xs)) : null };
  };
  return {
    sessions: rows.length,
    wind: [bucket("Viento flojo (< 2 m/s)", (r) => r.windMs, (v) => v < 2), bucket("Viento moderado (2–5 m/s)", (r) => r.windMs, (v) => v >= 2 && v <= 5), bucket("Viento fuerte (> 5 m/s)", (r) => r.windMs, (v) => v > 5)],
    temp: [bucket("Frío (< 10 °C)", (r) => r.tempC, (v) => v < 10), bucket("Templado (10–20 °C)", (r) => r.tempC, (v) => v >= 10 && v <= 20), bucket("Calor (> 20 °C)", (r) => r.tempC, (v) => v > 20)],
  };
}

// 4 · Mínimas y objetivos ----------------------------------------------------------
export const minimumSchema = z.object({
  name: z.string().trim().min(1).max(80),
  markM: z.number().min(1).max(120),
  deadline: isoDate.nullish(),
  implementWeightG: z.number().int().min(100).max(10_000).nullish(),
});

/** Distancia a la mínima con tu mejor marca de la temporada y, por la tendencia de 8 semanas, cuándo llegarías. */
export function minimumStatus(min: { markM: number; deadline: string | null; implementWeightG: number | null }, sessions: ThrowSession[], today: string) {
  const year = today.slice(0, 4);
  const pool = sessions.filter((s) => s.marks.length && (min.implementWeightG == null || s.implementWeightG === min.implementWeightG));
  const season = pool.filter((s) => s.date.startsWith(year));
  const sb = season.length ? Math.max(...season.map(best)) : null;
  const recent = pool.filter((s) => days(today, s.date) <= 56 && days(today, s.date) >= 0);
  let slopePerWeek: number | null = null;
  if (recent.length >= 4) {
    const xs = recent.map((s) => -days(today, s.date) / 7);
    const ys = recent.map(best);
    const mx = mean(xs);
    const my = mean(ys);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    slopePerWeek = sxx ? r2(xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx) : null;
  }
  const gap = sb == null ? null : r2(min.markM - sb);
  const weeksToReach = gap != null && gap > 0 && slopePerWeek && slopePerWeek > 0 ? Math.ceil(gap / slopePerWeek) : null;
  const daysLeft = min.deadline ? Math.round(days(min.deadline, today)) : null;
  return { seasonBest: sb, gap, reached: gap != null && gap <= 0, slopePerWeek, weeksToReach, daysLeft, onTrack: weeksToReach != null && daysLeft != null ? weeksToReach * 7 <= daysLeft : null };
}

// 5 · Previsión de marca en competición ------------------------------------------
/**
 * Competición ≈ mejor de entreno de las 3 semanas previas × tu relación competición/entreno
 * (de competiciones anteriores con entreno en las 3 semanas previas; hacen falta ≥ 2).
 */
export function competitionForecast(sessions: ThrowSession[], today: string, implementWeightG: number | null) {
  const pool = sessions.filter((s) => s.marks.length && s.implementWeightG === implementWeightG).sort((a, b) => a.date.localeCompare(b.date));
  const trainBefore = (date: string) => {
    const xs = pool.filter((s) => !s.isCompetition && days(date, s.date) > 0 && days(date, s.date) <= 21).map(best);
    return xs.length ? Math.max(...xs) : null;
  };
  const ratios = pool.filter((s) => s.isCompetition).flatMap((c) => {
    const t = trainBefore(c.date);
    return t ? [best(c) / t] : [];
  });
  const current = trainBefore(new Date(Date.parse(`${today}T00:00:00Z`) + 864e5).toISOString().slice(0, 10));
  if (ratios.length < 2 || current == null) return { ok: false as const, reason: ratios.length < 2 ? `Hacen falta 2 competiciones con entrenos de lanzamiento en las 3 semanas previas (tienes ${ratios.length}).` : "No hay lanzamientos de entreno en las últimas 3 semanas." };
  const m = mean(ratios);
  const e = sd(ratios);
  return { ok: true as const, trainingBest: current, ratio: Math.round(m * 1000) / 1000, markM: r2(current * m), lowM: r2(current * (m - e)), highM: r2(current * (m + e)), basedOn: ratios.length };
}
