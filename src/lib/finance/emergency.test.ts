import { describe, expect, it } from "vitest";

import { emergencyFund } from "@/lib/finance/emergency";

const m = (month: string, incomeCents: number, expenseCents: number) => ({ month, incomeCents, expenseCents });

describe("fondo de emergencia", () => {
  it("meses cubiertos, objetivo y proyección", () => {
    const r = emergencyFund([m("2026-04", 0, 0), m("2026-05", 120000, 90000), m("2026-06", 120000, 110000)], 200000, 3)!;
    expect(r.months).toBe(2);
    expect(r.avgExpenseCents).toBe(100000);
    expect(r.coveredMonths).toBe(2);
    expect(r.targetCents).toBe(300000);
    expect(r.missingCents).toBe(100000);
    expect(r.avgNetCents).toBe(20000);
    expect(r.monthsToTarget).toBe(5);
    expect(r.in12mCents).toBe(440000);
  });
  it("sin ahorro no hay plazo; sin datos, nada", () => {
    expect(emergencyFund([m("2026-05", 50000, 60000)], 10000, 3)!.monthsToTarget).toBeNull();
    expect(emergencyFund([m("2026-05", 0, 0)], 10000, 3)).toBeNull();
  });
});
