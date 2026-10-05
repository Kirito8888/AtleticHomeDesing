// =============================================================================
// Partida doble. Convención: amountCents > 0 = débito, < 0 = crédito.
// Invariante de cada asiento: Σ amountCents = 0 (también lo exige un trigger SQL).
// =============================================================================

import { addDays, dateOnly } from "@/lib/dates";

export interface PostingInput {
  accountId: string;
  amountCents: number;
  categoryId?: string | null;
  memo?: string | null;
}

export class LedgerError extends Error {}

export function assertBalanced(postings: PostingInput[]): void {
  if (postings.length < 2) throw new LedgerError("Un asiento necesita al menos dos líneas");
  for (const p of postings) {
    if (!Number.isSafeInteger(p.amountCents) || p.amountCents === 0) {
      throw new LedgerError("Cada línea debe ser un importe entero en céntimos distinto de 0");
    }
  }
  const sum = postings.reduce((a, p) => a + p.amountCents, 0);
  if (sum !== 0) throw new LedgerError(`El asiento no cuadra: la suma es ${sum} céntimos`);
}

export type SimpleKind = "EXPENSE" | "INCOME" | "TRANSFER";

/**
 * Traduce operaciones cotidianas a líneas de partida doble:
 *   Gasto:         + cuenta de gasto (con categoría)   − cuenta de pago
 *   Ingreso:       + cuenta de cobro                   − cuenta de ingreso (con categoría)
 *   Transferencia: + cuenta destino                    − cuenta origen
 */
export function buildSimplePostings(params: {
  kind: SimpleKind;
  amountCents: number;
  /** Cuenta de dinero (banco, efectivo, tarjeta) desde/hacia la que se mueve. */
  moneyAccountId: string;
  /** Cuenta de contrapartida: gasto/ingreso, o destino si es transferencia. */
  counterAccountId: string;
  categoryId?: string | null;
}): PostingInput[] {
  const { kind, amountCents, moneyAccountId, counterAccountId, categoryId } = params;
  if (amountCents <= 0) throw new LedgerError("El importe debe ser positivo");
  if (moneyAccountId === counterAccountId) throw new LedgerError("Las cuentas deben ser distintas");
  switch (kind) {
    case "EXPENSE":
      return [
        { accountId: counterAccountId, amountCents, categoryId },
        { accountId: moneyAccountId, amountCents: -amountCents },
      ];
    case "INCOME":
      return [
        { accountId: moneyAccountId, amountCents },
        { accountId: counterAccountId, amountCents: -amountCents, categoryId },
      ];
    case "TRANSFER":
      return [
        { accountId: counterAccountId, amountCents },
        { accountId: moneyAccountId, amountCents: -amountCents },
      ];
  }
}

export type Period = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/** Ventana [start, end] del periodo que contiene `ref`. Semanas ISO (lunes). */
export function periodWindow(period: Period, ref: Date): { start: Date; end: Date } {
  const d = dateOnly(ref);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (period) {
    case "WEEKLY": {
      const start = addDays(d, -((d.getUTCDay() + 6) % 7));
      return { start, end: addDays(start, 6) };
    }
    case "MONTHLY":
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)) };
    case "QUARTERLY": {
      const q = Math.floor(m / 3) * 3;
      return { start: new Date(Date.UTC(y, q, 1)), end: new Date(Date.UTC(y, q + 3, 0)) };
    }
    case "YEARLY":
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
  }
}

/**
 * Siguiente fecha de cobro. Si el día ancla no existe en el mes destino
 * (31 → febrero) se usa el último día de ese mes; pasando `anchorDay` se
 * recupera el día original en los meses que sí lo tienen.
 */
export function nextOccurrence(date: Date, interval: Period, anchorDay = date.getUTCDate()): Date {
  const d = dateOnly(date);
  if (interval === "WEEKLY") return addDays(d, 7);
  const months = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : 12;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, lastDay)));
}

export type BudgetState = "OK" | "WARNING" | "EXCEEDED";

export function budgetState(spentCents: number, budgetCents: number, alertPct: number): { pct: number; state: BudgetState } {
  const pct = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 1000) / 10 : 0;
  return { pct, state: pct >= 100 ? "EXCEEDED" : pct >= alertPct ? "WARNING" : "OK" };
}

/** "12,50" | "12.50" | 12.5 → 1250 céntimos (sin errores de coma flotante). */
export function toCents(value: number | string): number {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new LedgerError(`Importe no válido: ${value}`);
  const [int, dec = ""] = s.replace("-", "").split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return s.startsWith("-") ? -cents : cents;
}
