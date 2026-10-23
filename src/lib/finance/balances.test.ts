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

describe("recálculo al editar y borrar (apuntes reescritos)", () => {
  const exp = (acc: string, amountCents: number) => buildSimplePostings({ kind: "EXPENSE", amountCents, moneyAccountId: acc, counterAccountId: "gastos" });
  const bal = (ps: ReturnType<typeof exp>, acc: string) => balancesFromPostings(ps).get(acc) ?? 0;
  const opening = [
    { accountId: BANK, amountCents: 10000 },
    { accountId: "saldo", amountCents: -10000 },
  ];

  it("borrar un gasto de 30 € devuelve 30 € a la cuenta", () => {
    const gasto = exp(BANK, 3000);
    expect(bal([...opening, ...gasto], BANK)).toBe(7000);
    expect(bal(opening, BANK)).toBe(10000);
  });

  it("editar un gasto de 20 € a 50 € descuenta 30 € más", () => {
    expect(bal([...opening, ...exp(BANK, 2000)], BANK)).toBe(8000);
    expect(bal([...opening, ...exp(BANK, 5000)], BANK)).toBe(5000);
  });

  it("cambiar de cuenta devuelve el importe a la anterior y lo quita de la nueva; el consolidado no cambia", () => {
    const before = balancesFromPostings([...opening, { accountId: "cash", amountCents: 0 }, ...exp(BANK, 2000)]);
    const after = balancesFromPostings([...opening, { accountId: "cash", amountCents: 0 }, ...exp(BANK, 0 + 2000).map((p) => (p.accountId === BANK ? { ...p, accountId: "cash" } : p))]);
    expect(before.get(BANK)).toBe(8000);
    expect(after.get(BANK)).toBe(10000);
    expect(after.get("cash")).toBe(-2000);
    const net = (m: Map<string, number>) => moneySummary([...m].map(([id, balanceCents]) => ({ type: id === BANK || id === "cash" ? "ASSET" : "EXPENSE", balanceCents }))).netCents;
    expect(net(after)).toBe(net(before));
  });

  it("pasar de gasto a ingreso invierte el efecto en el saldo", () => {
    const ingreso = buildSimplePostings({ kind: "INCOME", amountCents: 2000, moneyAccountId: BANK, counterAccountId: "ingresos" });
    expect(bal([...opening, ...ingreso], BANK)).toBe(12000);
  });
});
