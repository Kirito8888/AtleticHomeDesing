import { budgetState, type BudgetState } from "./ledger";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v);

/** Primer y último día del mes «AAAA-MM» (UTC, como el resto de fechas sin hora). */
export function monthWindow(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

/** Mes anterior (−1) o siguiente (+1) a «AAAA-MM». */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BudgetProgress {
  pct: number;
  /** Porcentaje para pintar la barra: nunca pasa de 100. */
  barPct: number;
  state: BudgetState;
  overCents: number;
  remainingCents: number;
}

/** Avance de un presupuesto: 160 de 200 = 80 % (aviso); 220 de 200 = 110 % (excedido en 20). */
export function budgetProgress(spentCents: number, budgetCents: number, alertPct = 80): BudgetProgress {
  const { pct, state } = budgetState(spentCents, budgetCents, alertPct);
  return {
    pct,
    barPct: Math.min(100, Math.max(0, pct)),
    state,
    overCents: Math.max(0, spentCents - budgetCents),
    remainingCents: Math.max(0, budgetCents - spentCents),
  };
}

export interface Slice {
  key: string;
  name: string;
  cents: number;
  pct: number;
}

/**
 * Reparto del gasto del mes: porcentajes enteros que suman 100 (el resto va a la parte mayor)
 * y, a partir de `max` partes, el resto se agrupa en «Otras».
 */
export function distribution(rows: Array<{ key: string; name: string; cents: number }>, max = 6): Slice[] {
  const pos = rows.filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents);
  const total = pos.reduce((s, r) => s + r.cents, 0);
  if (!total) return [];
  let parts = pos;
  if (pos.length > max) {
    const rest = pos.slice(max - 1);
    parts = [...pos.slice(0, max - 1), { key: "_others", name: "Otras", cents: rest.reduce((s, r) => s + r.cents, 0) }];
  }
  const slices = parts.map((r) => ({ ...r, pct: Math.floor((r.cents / total) * 100) }));
  const left = 100 - slices.reduce((s, r) => s + r.pct, 0);
  slices[0].pct += left;
  return slices;
}
