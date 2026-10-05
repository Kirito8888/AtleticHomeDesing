import { describe, expect, it } from "vitest";

import { assertBalanced, budgetState, buildSimplePostings, LedgerError, nextOccurrence, periodWindow, toCents } from "./ledger";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("assertBalanced", () => {
  it("acepta asientos que suman 0", () => {
    expect(() => assertBalanced([{ accountId: "a", amountCents: 100 }, { accountId: "b", amountCents: -100 }])).not.toThrow();
  });
  it("rechaza descuadres, una sola línea, ceros y decimales", () => {
    expect(() => assertBalanced([{ accountId: "a", amountCents: 100 }, { accountId: "b", amountCents: -99 }])).toThrow(LedgerError);
    expect(() => assertBalanced([{ accountId: "a", amountCents: 0 }])).toThrow(LedgerError);
    expect(() => assertBalanced([{ accountId: "a", amountCents: 1.5 }, { accountId: "b", amountCents: -1.5 }])).toThrow(LedgerError);
  });
});

describe("buildSimplePostings", () => {
  it("gasto: debita gasto con categoría y acredita la cuenta de pago", () => {
    const p = buildSimplePostings({ kind: "EXPENSE", amountCents: 1250, moneyAccountId: "bank", counterAccountId: "exp", categoryId: "food" });
    expect(p).toEqual([
      { accountId: "exp", amountCents: 1250, categoryId: "food" },
      { accountId: "bank", amountCents: -1250 },
    ]);
    assertBalanced(p);
  });
  it("ingreso: debita el banco y acredita ingresos", () => {
    const p = buildSimplePostings({ kind: "INCOME", amountCents: 150000, moneyAccountId: "bank", counterAccountId: "inc" });
    expect(p[0]).toMatchObject({ accountId: "bank", amountCents: 150000 });
    expect(p[1]).toMatchObject({ accountId: "inc", amountCents: -150000 });
  });
  it("rechaza importes no positivos y misma cuenta", () => {
    expect(() => buildSimplePostings({ kind: "TRANSFER", amountCents: 0, moneyAccountId: "a", counterAccountId: "b" })).toThrow();
    expect(() => buildSimplePostings({ kind: "TRANSFER", amountCents: 5, moneyAccountId: "a", counterAccountId: "a" })).toThrow();
  });
});

describe("periodos y recurrencias", () => {
  it("ventanas de periodo", () => {
    const ref = new Date("2026-10-08T00:00:00Z"); // jueves
    expect(periodWindow("WEEKLY", ref)).toEqual({ start: new Date("2026-10-05"), end: new Date("2026-10-11") });
    expect(iso(periodWindow("MONTHLY", ref).end)).toBe("2026-10-31");
    expect(iso(periodWindow("QUARTERLY", ref).start)).toBe("2026-10-01");
    expect(iso(periodWindow("QUARTERLY", new Date("2026-02-15")).end)).toBe("2026-03-31");
  });
  it("siguiente cobro mensual acota a fin de mes y recupera el día ancla", () => {
    const feb = nextOccurrence(new Date("2026-01-31"), "MONTHLY");
    expect(iso(feb)).toBe("2026-02-28");
    expect(iso(nextOccurrence(feb, "MONTHLY", 31))).toBe("2026-03-31");
    expect(iso(nextOccurrence(new Date("2026-03-15"), "YEARLY"))).toBe("2027-03-15");
  });
});

describe("budgetState y toCents", () => {
  it("estados del presupuesto", () => {
    expect(budgetState(5000, 10000, 80)).toEqual({ pct: 50, state: "OK" });
    expect(budgetState(8500, 10000, 80).state).toBe("WARNING");
    expect(budgetState(10001, 10000, 80).state).toBe("EXCEEDED");
  });
  it("convierte importes sin error de coma flotante", () => {
    expect(toCents("12,50")).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("-3.5")).toBe(-350);
    expect(() => toCents("1.234")).toThrow();
  });
});
