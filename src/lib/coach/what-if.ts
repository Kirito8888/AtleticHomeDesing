// «Qué pasa si» (v2.0 B). Puro: compara escenarios de carga sin leer ni escribir nada.
import { projectPmc, type PmcDay } from "@/lib/training/pmc";
import { srpeTss } from "@/lib/training/tss";
import { rescheduleOptions } from "@/lib/planning/reschedule";

export type DayTss = { date: string; tss: number };
export type DraftDay = { date: string; tss: number; isThrow: boolean };

export interface ScenarioInput {
  seed?: { ctl: number; atl: number; date: string };
  /** Primer día proyectado (hoy) y último. */
  from: string;
  to: string;
  /** Sesiones PLANNED que la atleta ya tiene. */
  planned: DayTss[];
  /** Días del borrador que se copiaría. */
  draft: DraftDay[];
  /** Fechas de otras sesiones de lanzamiento y horas mínimas entre ellas. */
  throwDates: string[];
  minHours: number;
  /** Afinamiento: ventana [from, competition) y % de reducción. */
  taper?: { from: string; competition: string; pct: number };
  ctlDays?: number;
  atlDays?: number;
}

export interface ScenarioSummary {
  ctlEnd: number;
  atlPeak: number;
  tsbMin: number;
  acwrMax: number | null;
}
export interface Scenario {
  id: "base" | "copy" | "taper" | "reschedule";
  label: string;
  series: PmcDay[];
  summary: ScenarioSummary;
  /** Notas legibles (p. ej. días movidos). */
  notes: string[];
}

/** TSS previsto de una sesión planificada: el guardado, o sRPE con el RPE elegido. */
export function plannedTss(s: { tss: number | null; durationSec: number | null }, rpe: number): number {
  if (s.tss != null) return s.tss;
  return s.durationSec ? (srpeTss(s.durationSec, rpe) ?? 0) : 0;
}

const addIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function summarize(series: PmcDay[]): ScenarioSummary {
  const acwr = series.flatMap((d) => (d.acwr != null ? [d.acwr] : []));
  return {
    ctlEnd: series.at(-1)?.ctl ?? 0,
    atlPeak: Math.max(0, ...series.map((d) => d.atl)),
    tsbMin: series.length ? Math.min(...series.map((d) => d.tsb)) : 0,
    acwrMax: acwr.length ? Math.max(...acwr) : null,
  };
}

function run(i: ScenarioInput, load: DayTss[]): PmcDay[] {
  return projectPmc({ seed: i.seed, from: i.from, to: i.to, planned: load, ctlDays: i.ctlDays, atlDays: i.atlDays });
}

const inTaper = (t: NonNullable<ScenarioInput["taper"]>, date: string) => date >= t.from && date < t.competition;
const reduce = (t: ScenarioInput["taper"], d: DayTss): DayTss => (t && inTaper(t, d.date) ? { date: d.date, tss: d.tss * (1 - t.pct / 100) } : d);

/** Mueve los días del borrador que chocan con una sesión ya planificada al mejor día cercano (`rescheduleOptions`). */
export function resolveClashes(i: ScenarioInput): { days: DraftDay[]; moved: Array<{ from: string; to: string }> } {
  const busy: Record<string, number> = {};
  for (const p of i.planned) busy[p.date] = (busy[p.date] ?? 0) + 1;
  const throwDates = [...i.throwDates];
  const moved: Array<{ from: string; to: string }> = [];
  const days = [...i.draft]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      let date = d.date;
      if (busy[date]) {
        // Privacidad: sin exámenes ni síntomas (ciclo) en la vista de la entrenadora
        const best = rescheduleOptions({ today: date, horizon: 5, isThrow: d.isThrow, throwDates, minHours: i.minHours, examDates: [], symptomDates: [], busy })[0];
        if (best && best.date !== date) {
          moved.push({ from: date, to: best.date });
          date = best.date;
        }
      }
      busy[date] = (busy[date] ?? 0) + 1;
      if (d.isThrow) throwDates.push(date);
      return { ...d, date };
    });
  return { days, moved };
}

export function scenarios(i: ScenarioInput): Scenario[] {
  const base = run(i, i.planned);
  const withCopy = run(i, [...i.planned, ...i.draft]);
  const out: Scenario[] = [
    { id: "base", label: "Sin copiar", series: base, summary: summarize(base), notes: [] },
    { id: "copy", label: "Con la copia", series: withCopy, summary: summarize(withCopy), notes: [] },
  ];
  if (i.taper) {
    const s = run(i, [...i.planned, ...i.draft].map((d) => reduce(i.taper, d)));
    out.push({ id: "taper", label: `Con afinamiento (−${i.taper.pct} %)`, series: s, summary: summarize(s), notes: [`Ventana ${i.taper.from} → ${addIso(i.taper.competition, -1)}`] });
  }
  const { days, moved } = resolveClashes(i);
  if (moved.length) {
    const s = run(i, [...i.planned, ...days]);
    out.push({ id: "reschedule", label: "Recolocando choques", series: s, summary: summarize(s), notes: moved.map((m) => `${m.from} → ${m.to}`) });
  }
  return out;
}

// ---------- Permisos ----------

export type GrantInfo = { scopes: string[]; canPlan: boolean; restricted: boolean; linked: boolean };
export type Rejection = { id: string; reason: string };

/** Qué atletas se pueden planificar: vínculo activo, ámbito PLANNING, canPlan y sin limitación del tratamiento. */
export function filterEligible(ids: string[], grants: Map<string, GrantInfo>): { ok: string[]; rejected: Rejection[] } {
  const ok: string[] = [];
  const rejected: Rejection[] = [];
  for (const id of [...new Set(ids)]) {
    const g = grants.get(id);
    const reason = !g || !g.linked ? "Sin vínculo activo" : g.restricted ? "Ha limitado el tratamiento de sus datos" : !g.scopes.includes("PLANNING") ? "No te ha dado acceso a la planificación" : !g.canPlan ? "No te ha dado permiso de planificación" : null;
    if (reason) rejected.push({ id, reason });
    else ok.push(id);
  }
  return { ok, rejected };
}
