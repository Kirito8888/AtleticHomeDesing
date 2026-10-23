// Saldos por cuenta y balance neto. Sin servidor: lo usan la página y los tests.

export interface BalanceAccount {
  type: string;
  balanceCents: number;
}

/** Suma de apuntes por cuenta (+ débito / − crédito). */
export function balancesFromPostings(postings: Array<{ accountId: string; amountCents: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of postings) out.set(p.accountId, (out.get(p.accountId) ?? 0) + p.amountCents);
  return out;
}

/** Cuentas de dinero (activo y pasivo) y su balance neto; las de contrapartida no cuentan. */
export function moneySummary<T extends BalanceAccount>(accounts: T[]): { money: T[]; netCents: number } {
  const money = accounts.filter((a) => a.type === "ASSET" || a.type === "LIABILITY");
  return { money, netCents: money.reduce((a, x) => a + x.balanceCents, 0) };
}
