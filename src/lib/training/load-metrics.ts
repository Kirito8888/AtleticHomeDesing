/**
 * Monotonía y strain de Foster (1998) sobre la carga diaria (sRPE = RPE × minutos).
 * Monotonía = media / desviación típica de los 7 días (con los días a 0);
 * strain = carga semanal × monotonía.
 */
export type FosterWeek = { total: number; mean: number; sd: number; monotony: number | null; strain: number | null };

export function fosterWeek(daily: number[]): FosterWeek {
  const days = [...daily, ...Array(Math.max(0, 7 - daily.length)).fill(0)].slice(-7);
  const total = days.reduce((a, b) => a + b, 0);
  const mean = total / 7;
  const sd = Math.sqrt(days.reduce((a, d) => a + (d - mean) ** 2, 0) / 7);
  const r = (n: number) => Math.round(n * 100) / 100;
  if (!total || sd === 0) return { total, mean: r(mean), sd: r(sd), monotony: null, strain: null };
  const monotony = r(mean / sd);
  return { total: Math.round(total), mean: r(mean), sd: r(sd), monotony, strain: Math.round(total * monotony) };
}

/** Carga sRPE por día (fechas ISO) de los últimos 7 días hasta `today`. */
export function dailySrpe(sessions: Array<{ date: string; sessionRpe: number | null; durationSec: number | null }>, today: string): number[] {
  const out: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 864e5).toISOString().slice(0, 10);
    out.push(sessions.filter((s) => s.date === d && s.sessionRpe != null && s.durationSec).reduce((a, s) => a + s.sessionRpe! * (s.durationSec! / 60), 0));
  }
  return out;
}
