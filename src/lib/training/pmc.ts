// =============================================================================
// Performance Management Chart (modelo impulso-respuesta de Banister).
//   CTL (Fitness) = media exponencial de TSS a 42 días
//   ATL (Fatiga)  = media exponencial de TSS a 7 días
//   TSB (Forma)   = CTL(ayer) − ATL(ayer)  → forma con la que se llega a hoy
// Recurrencia (TrainingPeaks): X_hoy = X_ayer + (TSS_hoy − X_ayer) / N
// =============================================================================

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";

export interface PmcSeed {
  ctl: number;
  atl: number;
}

export interface PmcDay {
  date: string; // YYYY-MM-DD
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** ATL/CTL (EWMA). Zona habitual 0.8–1.3; > 1.5 indica pico de carga. */
  acwr: number | null;
}

export interface PmcOptions {
  start: string | Date;
  end: string | Date;
  ctlDays?: number;
  atlDays?: number;
  /** Valores del día anterior a `start` (para continuar una serie ya calculada). */
  seed?: PmcSeed;
  /** Primer día con datos del atleta. Antes de 28 días de historia el ACWR no es fiable → null. */
  historyStart?: string | Date;
}

/** Días de historia mínimos para que la carga crónica (y por tanto el ACWR) signifique algo. */
export const MIN_ACWR_HISTORY_DAYS = 28;

/**
 * Calcula la serie diaria completa entre start y end (inclusive). Los días sin
 * entrenamiento cuentan como TSS 0 — imprescindible para que la fatiga decaiga.
 * `dailyTss` puede traer varias entradas por día; se suman.
 */
export function computePmc(dailyTss: Array<{ date: string | Date; tss: number }>, opts: PmcOptions): PmcDay[] {
  const ctlDays = opts.ctlDays ?? 42;
  const atlDays = opts.atlDays ?? 7;
  const byDay = new Map<string, number>();
  for (const d of dailyTss) {
    const key = typeof d.date === "string" ? d.date.slice(0, 10) : toIsoDay(d.date);
    byDay.set(key, (byDay.get(key) ?? 0) + (d.tss || 0));
  }

  let ctl = opts.seed?.ctl ?? 0;
  let atl = opts.seed?.atl ?? 0;
  const out: PmcDay[] = [];
  const end = dateOnly(opts.end);
  const acwrFrom = addDays(dateOnly(opts.historyStart ?? opts.start), MIN_ACWR_HISTORY_DAYS - 1);
  for (let day = dateOnly(opts.start); day <= end; day = addDays(day, 1)) {
    const key = toIsoDay(day);
    const tss = byDay.get(key) ?? 0;
    const tsb = ctl - atl;
    ctl = ctl + (tss - ctl) / ctlDays;
    atl = atl + (tss - atl) / atlDays;
    out.push({
      date: key,
      tss: round2(tss),
      ctl: round2(ctl),
      atl: round2(atl),
      tsb: round2(tsb),
      acwr: day >= acwrFrom && ctl > 0 ? round2(atl / ctl) : null,
    });
  }
  return out;
}

/** Cambio de CTL en 7 días. > ~5–8 puntos/semana es una rampa agresiva. */
export function rampRate(series: PmcDay[]): number | null {
  if (series.length < 8) return null;
  const last = series[series.length - 1];
  const weekAgo = series[series.length - 8];
  return round2(last.ctl - weekAgo.ctl);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
