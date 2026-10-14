import type { Prefs } from "@/lib/rules/prefs";

/**
 * Tendencias de meses (puro, determinista y local): sueño, VFC, carga y molestias.
 * Los umbrales salen de «Mis reglas» (`prefs.trend*`); aquí solo hay mínimos de datos
 * para que una media signifique algo. Nada de esto va a la IA ni a la entrenadora.
 */
export type TrendCheck = { date: string; sleepHours: number | null; hrvRmssdMs: number | null; squeezePain: number | null; heelPain: number | null };
export type TrendSession = { date: string; sessionRpe: number | null; durationSec: number | null };
export type TrendFeeling = { date: string; pain: number };

/** Mínimo de lecturas del mes para fiarse de su media. */
export const MIN_SLEEP_NIGHTS = 7;
export const MIN_HRV_MORNINGS = 3;
/** Meses anteriores con datos que hacen falta como base. */
export const MIN_BASE_MONTHS = 2;

export type MonthStat = {
  /** «2026-10». */
  month: string;
  /** Días del mes ya transcurridos (el mes en curso es parcial). */
  days: number;
  partial: boolean;
  sleepH: number | null;
  sleepN: number;
  hrv: number | null;
  hrvN: number;
  /** Mañanas de VFC que caen en semanas marcadas «VFC» del plan. */
  hrvMarkedN: number;
  /** Carga sRPE media por semana (unidades arbitrarias = RPE × minutos). */
  loadWeekly: number | null;
  /** Días con alguna molestia por encima de tu umbral, y su equivalente por 30 días. */
  painDays: number;
  painPer30: number;
};

export type TrendAlert = {
  id: string;
  level: "warn" | "info";
  title: string;
  /** Qué ha pasado, en una frase. */
  cause: string;
  /** Valores exactos que activan el aviso. */
  values: Array<{ label: string; value: string }>;
  /** Umbral de «Mis reglas» que se ha superado. */
  threshold: string;
};

const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const f1 = (n: number) => String(r1(n)).replace(".", ",");
const monthOf = (d: string) => d.slice(0, 7);
const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

function mondayOf(date: string): string {
  const dow = (new Date(ms(date)).getUTCDay() + 6) % 7;
  return new Date(ms(date) - dow * DAY).toISOString().slice(0, 10);
}

/** Los `n` meses que terminan en el de `today`, del más antiguo al actual. */
export function lastMonths(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function monthlyTrends(input: {
  today: string;
  prefs: Prefs;
  checks: TrendCheck[];
  sessions: TrendSession[];
  feelings: TrendFeeling[];
  /** Lunes ISO de las semanas marcadas «VFC» en el plan. */
  hrvWeeks: string[];
}): MonthStat[] {
  const { today, prefs, checks, sessions, feelings } = input;
  const marked = new Set(input.hrvWeeks);
  return lastMonths(today, prefs.trendMonths).map((month) => {
    const partial = month === monthOf(today);
    const days = partial ? Number(today.slice(8, 10)) : daysInMonth(month);
    const inMonth = (d: string) => monthOf(d) === month && d <= today;
    const cs = checks.filter((c) => inMonth(c.date));
    const sleep = cs.flatMap((c) => (c.sleepHours != null ? [c.sleepHours] : []));
    const hrvRows = cs.filter((c) => c.hrvRmssdMs != null);
    const hrv = hrvRows.map((c) => c.hrvRmssdMs!);
    const load = sessions.filter((s) => inMonth(s.date) && s.sessionRpe != null && s.durationSec).reduce((a, s) => a + s.sessionRpe! * (s.durationSec! / 60), 0);
    const painDates = new Set<string>();
    for (const c of cs) if ((c.squeezePain ?? 0) > prefs.squeezeMax || (c.heelPain ?? 0) > prefs.heelMax) painDates.add(c.date);
    for (const f of feelings) if (inMonth(f.date) && f.pain > prefs.feelingPainMax) painDates.add(f.date);
    return {
      month,
      days,
      partial,
      sleepH: sleep.length >= MIN_SLEEP_NIGHTS ? mean(sleep) : null,
      sleepN: sleep.length,
      hrv: hrv.length >= MIN_HRV_MORNINGS ? mean(hrv) : null,
      hrvN: hrv.length,
      hrvMarkedN: hrvRows.filter((c) => marked.has(mondayOf(c.date))).length,
      loadWeekly: sessions.some((s) => inMonth(s.date)) ? (load / days) * 7 : null,
      painDays: painDates.size,
      painPer30: (painDates.size / days) * 30,
    };
  });
}

const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Compara el mes más reciente con datos suficientes frente a la media de los meses anteriores
 * (mínimo `MIN_BASE_MONTHS`). Cada aviso dice la causa y los valores que lo activan.
 */
export function trendAlerts(months: MonthStat[], prefs: Prefs): TrendAlert[] {
  const out: TrendAlert[] = [];
  /** Último mes con valor y media de los anteriores con valor. */
  const split = (pick: (m: MonthStat) => number | null) => {
    const withVal = months.flatMap((m) => {
      const v = pick(m);
      return v == null ? [] : [{ m, v }];
    });
    if (withVal.length < MIN_BASE_MONTHS + 1) return null;
    const recent = withVal.at(-1)!;
    const base = withVal.slice(0, -1);
    return { recent, base, baseMean: mean(base.map((b) => b.v))! };
  };
  const baseText = (base: Array<{ m: MonthStat; v: number }>, fmt: (v: number) => string) => base.map((b) => `${monthLabel(b.m.month)}: ${fmt(b.v)}`).join(" · ");

  const sleep = split((m) => m.sleepH);
  const sleepDrop = sleep ? sleep.baseMean - sleep.recent.v : 0;
  if (sleep && sleepDrop >= prefs.trendSleepDropH) {
    out.push({
      id: "trend-sleep",
      level: "warn",
      title: `Duermes ${f1(sleepDrop)} h menos que en los meses anteriores`,
      cause: `La media de sueño de ${monthLabel(sleep.recent.m.month)} (${sleep.recent.m.sleepN} noches) es ${f1(sleep.recent.v)} h frente a ${f1(sleep.baseMean)} h de los meses anteriores.`,
      values: [
        { label: `Mes reciente ${monthLabel(sleep.recent.m.month)}`, value: `${f1(sleep.recent.v)} h` },
        { label: "Media anterior", value: `${f1(sleep.baseMean)} h (${baseText(sleep.base, f1)})` },
        { label: "Diferencia", value: `−${f1(sleepDrop)} h` },
      ],
      threshold: `Bajada de sueño ≥ ${f1(prefs.trendSleepDropH)} h`,
    });
  }

  const hrv = split((m) => m.hrv);
  const hrvDrop = hrv ? ((hrv.baseMean - hrv.recent.v) / hrv.baseMean) * 100 : 0;
  if (hrv && hrvDrop >= prefs.trendHrvDropPct) {
    out.push({
      id: "trend-hrv",
      level: "warn",
      title: `VFC −${f1(hrvDrop)} % frente a los meses anteriores`,
      cause: `La VFC media de ${monthLabel(hrv.recent.m.month)} (${hrv.recent.m.hrvN} mañanas) es ${f1(hrv.recent.v)} ms frente a ${f1(hrv.baseMean)} ms de los meses anteriores.`,
      values: [
        { label: `Mes reciente ${monthLabel(hrv.recent.m.month)}`, value: `${f1(hrv.recent.v)} ms` },
        { label: "Media anterior", value: `${f1(hrv.baseMean)} ms (${baseText(hrv.base, f1)})` },
        { label: "Caída", value: `−${f1(hrvDrop)} %` },
      ],
      threshold: `Caída de VFC ≥ ${f1(prefs.trendHrvDropPct)} %`,
    });
  }

  const load = split((m) => m.loadWeekly);
  const loadRise = load && load.baseMean > 0 ? ((load.recent.v - load.baseMean) / load.baseMean) * 100 : 0;
  if (load && loadRise >= prefs.trendLoadRisePct) {
    out.push({
      id: "trend-load",
      level: "info",
      title: `Carga semanal +${Math.round(loadRise)} % frente a los meses anteriores`,
      cause: `La carga sRPE media por semana de ${monthLabel(load.recent.m.month)} es ${Math.round(load.recent.v)} frente a ${Math.round(load.baseMean)} de los meses anteriores.`,
      values: [
        { label: `Mes reciente ${monthLabel(load.recent.m.month)}`, value: `${Math.round(load.recent.v)} u.a./semana` },
        { label: "Media anterior", value: `${Math.round(load.baseMean)} u.a./semana (${baseText(load.base, (v) => String(Math.round(v)))})` },
        { label: "Subida", value: `+${Math.round(loadRise)} %` },
      ],
      threshold: `Subida de carga ≥ ${prefs.trendLoadRisePct} %`,
    });
  }

  // Molestias: días con molestia por 30 días, solo si hay meses anteriores con alguna señal registrada.
  const pain = split((m) => (m.sleepN || m.hrvN || m.loadWeekly != null || m.painDays ? m.painPer30 : null));
  const painRise = pain ? pain.recent.v - pain.baseMean : 0;
  if (pain && painRise >= prefs.trendPainDaysRise) {
    out.push({
      id: "trend-pain",
      level: "warn",
      title: `Más días con molestia: +${f1(painRise)} cada 30 días`,
      cause: `En ${monthLabel(pain.recent.m.month)} hubo ${pain.recent.m.painDays} día${pain.recent.m.painDays === 1 ? "" : "s"} con molestia por encima de tus umbrales (${f1(pain.recent.v)} cada 30 días) frente a ${f1(pain.baseMean)} de media en los meses anteriores.`,
      values: [
        { label: `Mes reciente ${monthLabel(pain.recent.m.month)}`, value: `${pain.recent.m.painDays} días (${f1(pain.recent.v)}/30 d)` },
        { label: "Media anterior", value: `${f1(pain.baseMean)} días/30 d (${baseText(pain.base, f1)})` },
        { label: "Aumento", value: `+${f1(painRise)} días/30 d` },
      ],
      threshold: `Aumento ≥ ${prefs.trendPainDaysRise} días con molestia cada 30 días`,
    });
  }

  // Varias señales a la vez: el aviso que más importa.
  const fired = [sleepDrop >= prefs.trendSleepDropH && sleep, hrvDrop >= prefs.trendHrvDropPct && hrv, loadRise >= prefs.trendLoadRisePct && load, painRise >= prefs.trendPainDaysRise && pain].filter(Boolean).length;
  if (fired >= 2) {
    const names = out.map((a) => a.id.replace("trend-", "")).map((k) => ({ sleep: "sueño", hrv: "VFC", load: "carga", pain: "molestias" })[k as "sleep"]);
    out.unshift({
      id: "trend-combo",
      level: "warn",
      title: "Varias señales de fatiga acumulada a la vez",
      cause: `Coinciden ${fired} señales en ${monthLabel(months.at(-1)!.month)}: ${names.join(", ")}. Juntas pesan más que cada una por separado.`,
      values: out.map((a) => ({ label: a.title, value: a.threshold })),
      threshold: "Dos o más avisos de tendencia a la vez",
    });
  }
  return out;
}
