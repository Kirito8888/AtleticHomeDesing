import { describe, expect, it } from "vitest";

import { cashflowSummary, compositionSummary, pmcSummary, trendWord } from "./alt-text";

describe("trendWord", () => {
  it("distingue sube, baja y estable", () => {
    expect(trendWord(10, 20)).toBe("sube");
    expect(trendWord(20, 10)).toBe("baja");
    expect(trendWord(100, 101)).toBe("estable");
  });
});

describe("pmcSummary", () => {
  it("sin datos", () => expect(pmcSummary([])).toMatch(/Sin datos/));
  it("usa el último valor no nulo y la tendencia del fitness", () => {
    const s = pmcSummary([
      { date: "2026-11-01", ctl: 40, atl: 50, tsb: -10 },
      { date: "2026-11-10", ctl: 52, atl: 60, tsb: -8 },
      { date: "2026-11-11", ctl: null, atl: null, tsb: null },
    ]);
    expect(s).toMatch(/fitness \(CTL\) 52/);
    expect(s).toMatch(/forma \(TSB\) −8|forma \(TSB\) -8/);
    expect(s).toMatch(/fitness sube/);
  });
  it("un solo punto no inventa tendencia", () => expect(pmcSummary([{ date: "2026-11-01", ctl: 5 }])).not.toMatch(/sube|baja|estable/));
});

describe("cashflowSummary", () => {
  it("sin datos", () => expect(cashflowSummary([])).toMatch(/Sin movimientos/));
  it("suma céntimos y señala mejor y peor mes", () => {
    const s = cashflowSummary([
      { month: "2026-09", incomeCents: 200000, expenseCents: 150000, netCents: 50000 },
      { month: "2026-10", incomeCents: 200000, expenseCents: 230000, netCents: -30000 },
    ]);
    expect(s).toMatch(/2 meses/);
    expect(s).toMatch(/4\.000|4000/);
    expect(s).toMatch(/Mejor neto: septiembre/);
    expect(s).toMatch(/peor: octubre/);
  });
  it("un mes no compara", () => expect(cashflowSummary([{ month: "2026-09", incomeCents: 1, expenseCents: 1, netCents: 0 }])).not.toMatch(/Mejor/));
});

describe("compositionSummary", () => {
  const r = (date: string, fatKg: number, muscleKg: number) => ({ date, weightKg: 75, fatKg, fatPct: fatKg, muscleKg, musclePct: muscleKg });
  it("vacío y una medición", () => {
    expect(compositionSummary([], "kg")).toMatch(/Sin mediciones/);
    expect(compositionSummary([r("2026-11-09", 10, 30)], "kg")).toMatch(/solo hay una medición/);
  });
  it("tendencia entre primera y última, según unidad", () => {
    const rows = [r("2026-11-09", 12, 30), r("2026-12-09", 9, 33)];
    expect(compositionSummary(rows, "kg")).toMatch(/peso 75/);
    expect(compositionSummary(rows, "kg")).toMatch(/masa grasa baja, masa muscular sube/);
    expect(compositionSummary(rows, "%")).not.toMatch(/peso 75/);
  });
});
