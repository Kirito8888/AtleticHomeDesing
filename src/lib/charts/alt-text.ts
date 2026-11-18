import { formatDate, formatEur, formatNum } from "@/lib/format";

/** v3.0 T · V3-A12: resúmenes en texto de los gráficos (PMC, finanzas, composición). Funciones puras. */

type Num = number | null | undefined;

const last = <T>(xs: T[], pick: (x: T) => Num): { x: T; v: number } | null => {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = pick(xs[i]);
    if (v != null && Number.isFinite(v)) return { x: xs[i], v };
  }
  return null;
};

/** «sube», «baja» o «estable» según la diferencia relativa entre el primer y el último valor (umbral 2 %). */
export function trendWord(first: number, lastV: number): "sube" | "baja" | "estable" {
  const scale = Math.max(Math.abs(first), Math.abs(lastV), 1);
  const rel = (lastV - first) / scale;
  return rel > 0.02 ? "sube" : rel < -0.02 ? "baja" : "estable";
}

export interface PmcSummaryPoint {
  date: string;
  ctl?: Num;
  atl?: Num;
  tsb?: Num;
  tss?: Num;
}

export function pmcSummary(points: PmcSummaryPoint[]): string {
  if (!points.length) return "Sin datos de carga todavía.";
  const ctl = last(points, (p) => p.ctl);
  const atl = last(points, (p) => p.atl);
  const tsb = last(points, (p) => p.tsb);
  const ref = ctl?.x ?? atl?.x ?? tsb?.x ?? points[points.length - 1];
  const parts: string[] = [];
  if (ctl) parts.push(`fitness (CTL) ${formatNum(ctl.v)}`);
  if (atl) parts.push(`fatiga (ATL) ${formatNum(atl.v)}`);
  if (tsb) parts.push(`forma (TSB) ${formatNum(tsb.v)}`);
  const head = `Carga a fecha ${formatDate(ref.date, { day: "numeric", month: "long", year: "numeric" })}: ${parts.length ? parts.join(", ") : "sin valores"}.`;
  const firstCtl = points.find((p) => p.ctl != null && Number.isFinite(p.ctl));
  const trend = ctl && firstCtl && firstCtl !== ctl.x ? ` En el periodo (${points.length} días) el fitness ${trendWord(firstCtl.ctl as number, ctl.v)}.` : "";
  return head + trend;
}

export interface CashflowSummaryRow {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export function cashflowSummary(rows: CashflowSummaryRow[]): string {
  if (!rows.length) return "Sin movimientos todavía.";
  const sum = (f: (r: CashflowSummaryRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const best = rows.reduce((a, r) => (r.netCents > a.netCents ? r : a));
  const worst = rows.reduce((a, r) => (r.netCents < a.netCents ? r : a));
  const m = (r: CashflowSummaryRow) => formatDate(`${r.month}-01`, { month: "long", year: "numeric" });
  const base = `${rows.length} ${rows.length === 1 ? "mes" : "meses"}: ingresos ${formatEur(sum((r) => r.incomeCents))}, gastos ${formatEur(sum((r) => r.expenseCents))}, neto ${formatEur(sum((r) => r.netCents))}.`;
  return rows.length > 1 ? `${base} Mejor neto: ${m(best)} (${formatEur(best.netCents)}); peor: ${m(worst)} (${formatEur(worst.netCents)}).` : base;
}

export interface CompositionSummaryRow {
  date: string;
  weightKg: number;
  fatKg: number;
  fatPct: number;
  muscleKg: number;
  musclePct: number;
}

export function compositionSummary(rows: CompositionSummaryRow[], unit: "kg" | "%"): string {
  if (!rows.length) return "Sin mediciones todavía.";
  const a = rows[0];
  const b = rows[rows.length - 1];
  const u = unit === "kg" ? " kg" : " %";
  const fat = (r: CompositionSummaryRow) => (unit === "kg" ? r.fatKg : r.fatPct);
  const mus = (r: CompositionSummaryRow) => (unit === "kg" ? r.muscleKg : r.musclePct);
  const when = formatDate(b.date, { day: "numeric", month: "long", year: "numeric" });
  const head = `Última medición (${when}): ${unit === "kg" ? `peso ${formatNum(b.weightKg, 2)} kg, ` : ""}masa grasa ${formatNum(fat(b), 2)}${u}, masa muscular ${formatNum(mus(b), 2)}${u}.`;
  if (rows.length < 2) return `${head} Aún sin evolución: solo hay una medición.`;
  return `${head} Desde ${formatDate(a.date, { day: "numeric", month: "long", year: "numeric" })} (${rows.length} mediciones): masa grasa ${trendWord(fat(a), fat(b))}, masa muscular ${trendWord(mus(a), mus(b))}.`;
}
