import type { Prefs } from "./prefs";

/**
 * Motor de reglas con avisos (puro). Los umbrales salen de «Mis reglas»; los
 * textos son pautas de prudencia genéricas, no diagnósticos.
 */
export type DayCheck = {
  date: string;
  squeezePain: number | null;
  heelPain: number | null;
  jumpCm: number | null;
  elbowSymptoms: boolean | null;
  bodyWeightKg: number | null;
  bodyFatPct: number | null;
  hrvRmssdMs: number | null;
};
export type ThrowSession = { date: string; throws: number; videoTotal: number | null; videoElbowOk: number | null; videoHeadOk: number | null };
/** Molestia anotada al cerrar una sesión. */
export type FeelingCheck = { date: string; area: string; label: string; pain: number };
export type Alert = { id: string; level: "warn" | "info"; title: string; message: string };

const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DAY);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Lunes de la semana ISO de una fecha. */
export function weekOf(date: string): string {
  const t = ms(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

/** Medias semanales (por lunes) de un valor; solo semanas con ≥ min lecturas. */
export function weeklyMeans(checks: DayCheck[], pick: (c: DayCheck) => number | null, min = 1): Array<{ week: string; mean: number; n: number }> {
  const by = new Map<string, number[]>();
  for (const c of checks) {
    const v = pick(c);
    if (v == null) continue;
    const w = weekOf(c.date);
    by.set(w, [...(by.get(w) ?? []), v]);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length >= min)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, v]) => ({ week, mean: mean(v)!, n: v.length }));
}

/** Lanzamientos por semana (lunes → total) de las últimas `n` semanas hasta `today`, con 0 en las vacías. */
export function weeklyThrows(sessions: ThrowSession[], today: string, n = 5): Array<{ week: string; throws: number }> {
  const current = weekOf(today);
  const out: Array<{ week: string; throws: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const week = new Date(ms(current) - i * 7 * DAY).toISOString().slice(0, 10);
    out.push({ week, throws: sessions.filter((s) => weekOf(s.date) === week).reduce((a, s) => a + s.throws, 0) });
  }
  return out;
}

/**
 * Tope semanal: ratio × media de las 4 semanas anteriores (redondeado). null si
 * no hay base fiable (menos de 3 de esas semanas con lanzamientos: vuelta a lanzar).
 */
export function throwCap(weeks: Array<{ throws: number }>, ratio: number): number | null {
  const prev = weeks.slice(-5, -1);
  if (prev.length < 4 || prev.filter((w) => w.throws > 0).length < 3) return null;
  const m = mean(prev.map((w) => w.throws))!;
  return m > 0 ? Math.round(m * ratio) : null;
}

export function evaluateRules(input: { today: string; prefs: Prefs; checks: DayCheck[]; throws: ThrowSession[]; feelings?: FeelingCheck[] }): Alert[] {
  const { today, prefs, checks } = input;
  const alerts: Alert[] = [];
  const recent = (d: number) => checks.filter((c) => days(today, c.date) >= 0 && days(today, c.date) < d);
  const latest = <K extends keyof DayCheck>(k: K, within: number) => recent(within).filter((c) => c[k] != null).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;

  // Aductor (test squeeze)
  const squeezes = checks.filter((c) => c.squeezePain != null && days(today, c.date) >= 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const sq = latest("squeezePain", 7);
  if (sq && sq.squeezePain! > prefs.squeezeMax) {
    alerts.push({
      id: "squeeze",
      level: "warn",
      title: `Squeeze ${sq.squeezePain}/10`,
      message: "Esta semana, sin esprints ni saltos reactivos. Durante 72 h, cambia los cruces por carrera recta y lanza desde parado o con pocos pasos (mismo número de lanzamientos).",
    });
    const prev = squeezes.find((c) => days(sq.date, c.date) >= 5 && days(sq.date, c.date) <= 9);
    if (prev && prev.squeezePain! > prefs.squeezeMax) {
      alerts.push({ id: "squeeze-2", level: "warn", title: "Dos controles seguidos por encima del umbral", message: "Sin cruces ni esprints hasta que te valore un fisioterapeuta." });
    }
  }

  // Talón
  const heel = latest("heelPain", 7);
  if (heel && heel.heelPain! > prefs.heelMax) {
    alerts.push({ id: "heel", level: "warn", title: `Talón ${heel.heelPain}/10`, message: "Aproximación corta o desde parado; saltos en profundidad → salto con contramovimiento (CMJ). Si es semana de competición, fuera los saltos." });
  }

  // Codo
  const elbow = recent(3).find((c) => c.elbowSymptoms);
  if (elbow) {
    alerts.push({
      id: "elbow",
      level: "warn",
      title: "Síntomas en el codo",
      message: "Si aparecen al lanzar, para ese día. La siguiente sesión, solo desde parado, con implemento ligero y la mitad de lanzamientos; si vuelven, sin lanzar hasta que te valoren.",
    });
  }

  // Sensaciones al cerrar la sesión (últimos 3 días): la más alta por zona
  const worst = new Map<string, FeelingCheck>();
  for (const f of input.feelings ?? []) {
    const d = days(today, f.date);
    if (d < 0 || d >= 3 || f.pain <= prefs.feelingPainMax) continue;
    const cur = worst.get(f.area);
    if (!cur || f.pain > cur.pain || (f.pain === cur.pain && f.date > cur.date)) worst.set(f.area, f);
  }
  for (const f of worst.values()) {
    alerts.push({
      id: `feeling-${f.area}`,
      level: "warn",
      title: `Molestia en ${f.label.toLowerCase()} (${f.pain}/10)`,
      message: "La anotaste al terminar una sesión. Si sigue hoy, regístrala en Recuperación → Molestias y quita de la sesión lo que la provoque.",
    });
  }

  // Peso (media semanal)
  const wm = weeklyMeans(checks, (c) => c.bodyWeightKg);
  if (wm.length >= 3) {
    const [a, b, c] = wm.slice(-3);
    if (b.mean - a.mean >= prefs.weightGainWeekKg && c.mean - b.mean >= prefs.weightGainWeekKg) {
      alerts.push({ id: "weight-up", level: "warn", title: "Peso subiendo dos semanas seguidas", message: `Media semanal ${r1(a.mean)} → ${r1(b.mean)} → ${r1(c.mean)} kg. Revisa los hidratos de los días sin lanzamientos y no subas el volumen esta semana.` });
    }
  }
  if (wm.length >= 2) {
    const last = wm.at(-1)!;
    const base = wm.find((w) => days(last.week, w.week) >= 28) ?? null;
    const ref = [...wm].reverse().find((w) => days(last.week, w.week) >= 21 && days(last.week, w.week) <= 35) ?? base;
    if (ref && Math.abs(last.mean - ref.mean) >= prefs.weightBlockKg) {
      alerts.push({ id: "weight-block", level: "info", title: `Peso ${last.mean > ref.mean ? "+" : ""}${r1(last.mean - ref.mean)} kg en un mes`, message: "Cambio de peso notable respecto a hace unas semanas: revisa la ingesta con tu plantilla." });
    }
    if (prefs.weightMinKg != null && last.mean < prefs.weightMinKg) {
      alerts.push({ id: "weight-min", level: "warn", title: `Peso por debajo de ${prefs.weightMinKg} kg`, message: `Media de esta semana: ${r1(last.mean)} kg. Revisa la ingesta.` });
    }
  }
  const fm = weeklyMeans(checks, (c) => c.bodyFatPct);
  if (fm.length >= 2) {
    const last = fm.at(-1)!;
    const ref = [...fm].reverse().find((w) => days(last.week, w.week) >= 21);
    if (ref && Math.abs(last.mean - ref.mean) >= prefs.bodyFatBlockPts) {
      alerts.push({ id: "fat", level: "info", title: `% de grasa ${last.mean > ref.mean ? "+" : ""}${r1(last.mean - ref.mean)} puntos`, message: "Solo como tendencia: la báscula no es precisa, pero el cambio es grande." });
    }
  }

  // VFC: media de la semana (≥3 mañanas) frente a la media de las semanas anteriores con ≥3
  const hm = weeklyMeans(checks, (c) => c.hrvRmssdMs, 3);
  if (hm.length >= 3 && hm.at(-1)!.week === weekOf(today)) {
    const cur = hm.at(-1)!;
    const ref = mean(hm.slice(0, -1).map((w) => w.mean))!;
    const drop = ((ref - cur.mean) / ref) * 100;
    const jumps = weeklyMeans(checks, (c) => c.jumpCm);
    const jumpDown = jumps.length >= 2 && jumps.at(-1)!.mean < jumps.at(-2)!.mean;
    const squeezeHigh = Boolean(sq && sq.squeezePain! > prefs.squeezeMax);
    if (drop > prefs.hrvDropPct && (jumpDown || squeezeHigh)) {
      alerts.push({ id: "hrv", level: "warn", title: `VFC −${r1(drop)} % esta semana`, message: "Con el salto más bajo o el squeeze alto: quita el contraste y los saltos reactivos esta semana; mantén cargas y lanzamientos." });
    } else if (drop > prefs.hrvDropPct) {
      alerts.push({ id: "hrv-info", level: "info", title: `VFC −${r1(drop)} % esta semana`, message: "Solo lo anoto: sin otras señales no cambia nada." });
    }
  }

  // Lanzamientos: tope semanal, vuelta tras parar y 48 h entre sesiones
  const wt = weeklyThrows(input.throws, today, 5);
  const cap = throwCap(wt, prefs.throwCapRatio);
  const now = wt.at(-1)!;
  if (cap != null && now.throws > cap) {
    alerts.push({ id: "throw-cap", level: "warn", title: `Lanzamientos: ${now.throws} esta semana (tope ${cap})`, message: `Superas ${prefs.throwCapRatio} × la media de las 4 semanas anteriores. Corta aquí la semana.` });
  } else if (wt.slice(-3, -1).every((w) => w.throws === 0) && wt.slice(0, -1).some((w) => w.throws > 0)) {
    alerts.push({ id: "throw-return", level: "info", title: "Vuelta a lanzar", message: "Tras 2 semanas o más sin lanzar, el tope no sirve: empieza con unos 12 lanzamientos submáximos y sube unos 7 por semana." });
  }
  const throwDays = [...new Set(input.throws.filter((s) => s.throws > 0 && days(today, s.date) >= 0).map((s) => s.date))].sort().reverse();
  if (throwDays.length >= 2 && days(throwDays[0], throwDays[1]) * 24 < prefs.throwMinHours) {
    alerts.push({ id: "throw-48h", level: "warn", title: `Dos sesiones de lanzamiento con menos de ${prefs.throwMinHours} h`, message: `${throwDays[1]} y ${throwDays[0]}. Deja al menos ${prefs.throwMinHours} h entre sesiones de lanzamiento.` });
  }

  // Vídeo contado: dos semanas seguidas por debajo del mínimo
  const vw = new Map<string, { t: number; e: number; h: number }>();
  for (const s of input.throws) {
    if (!s.videoTotal) continue;
    const w = weekOf(s.date);
    const v = vw.get(w) ?? { t: 0, e: 0, h: 0 };
    v.t += s.videoTotal;
    v.e += s.videoElbowOk ?? 0;
    v.h += s.videoHeadOk ?? 0;
    vw.set(w, v);
  }
  const vlast = [...vw.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-2);
  if (vlast.length === 2 && days(vlast[1][0], vlast[0][0]) === 7) {
    for (const [key, label] of [
      ["e", "el codo estirado al apoyar"],
      ["h", "la cabeza estable en los cruces"],
    ] as const) {
      if (vlast.every(([, v]) => (v[key] / v.t) * 100 < prefs.videoMinPct)) {
        alerts.push({ id: `video-${key}`, level: "info", title: `Vídeo: menos del ${prefs.videoMinPct} % con ${label}`, message: "Dos semanas seguidas: la semana que viene, todos los focos técnicos para ese error." });
      }
    }
  }
  return alerts;
}
