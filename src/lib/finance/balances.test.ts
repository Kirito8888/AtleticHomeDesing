import { describe, expect, it } from "vitest";

import { balancesFromPostings, moneySummary } from "./balances";
import { assertBalanced, buildSimplePostings } from "./ledger";

const BANK = "bank";

/** Apuntes de una secuencia de operaciones sobre una cuenta de banco. */
function ledger(ops: Array<{ kind: "INCOME" | "EXPENSE"; cents: number }>) {
  const opening = [
    { accountId: BANK, amountCents: 10000 },
    { accountId: "equity", amountCents: -10000 },
  ];
  const all = ops.flatMap((o) => {
    const p = buildSimplePostings({ kind: o.kind, amountCents: o.cents, moneyAccountId: BANK, counterAccountId: o.kind === "INCOME" ? "income" : "expense" });
    assertBalanced(p);
    return p;
  });
  return balancesFromPostings([...opening, ...all]);
}

describe("saldos", () => {
  it("100 € iniciales + ingreso 50 € − gasto 30 € = 120 €", () => {
    expect(ledger([{ kind: "INCOME", cents: 5000 }, { kind: "EXPENSE", cents: 3000 }]).get(BANK)).toBe(12000);
  });

  it("un gasto mayor que el saldo deja la cuenta en negativo", () => {
    expect(ledger([{ kind: "EXPENSE", cents: 15000 }]).get(BANK)).toBe(-5000);
  });

  it("el balance neto suma activos y pasivos y deja fuera las cuentas de contrapartida", () => {
    const s = moneySummary([
      { type: "ASSET", balanceCents: 12000 },
      { type: "ASSET", balanceCents: 2500 },
      { type: "LIABILITY", balanceCents: -35000 },
      { type: "EXPENSE", balanceCents: 3000 },
      { type: "EQUITY", balanceCents: -10000 },
    ]);
    expect(s.money).toHaveLength(3);
    expect(s.netCents).toBe(-20500);
  });

  it("sin cuentas el balance es 0", () => {
    expect(moneySummary([]).netCents).toBe(0);
  });
});
