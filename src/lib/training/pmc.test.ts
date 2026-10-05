import { describe, expect, it } from "vitest";

import { computePmc, rampRate } from "./pmc";

describe("computePmc", () => {
  it("rellena días sin entreno con TSS 0", () => {
    const s = computePmc([{ date: "2026-01-01", tss: 100 }], { start: "2026-01-01", end: "2026-01-05" });
    expect(s).toHaveLength(5);
    expect(s.map((d) => d.tss)).toEqual([100, 0, 0, 0, 0]);
  });

  it("aplica la recurrencia EWMA y TSB = CTL − ATL del día anterior", () => {
    const s = computePmc([{ date: "2026-01-01", tss: 70 }], { start: "2026-01-01", end: "2026-01-02" });
    expect(s[0].ctl).toBeCloseTo(70 / 42, 2);
    expect(s[0].atl).toBeCloseTo(10, 2);
    expect(s[0].tsb).toBe(0);
    expect(s[1].tsb).toBeCloseTo(70 / 42 - 10, 2);
  });

  it("converge a la carga diaria constante", () => {
    const days = Array.from({ length: 400 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 0, 1 + i)),
      tss: 80,
    }));
    const s = computePmc(days, { start: "2025-01-01", end: "2026-02-04" });
    const last = s[s.length - 1];
    expect(last.ctl).toBeCloseTo(80, 0);
    expect(last.atl).toBeCloseTo(80, 1);
    expect(last.acwr).toBeCloseTo(1, 1);
  });

  it("continúa una serie desde una semilla", () => {
    const s = computePmc([], { start: "2026-03-01", end: "2026-03-01", seed: { ctl: 50, atl: 70 } });
    expect(s[0].tsb).toBe(-20);
    expect(s[0].atl).toBeCloseTo(60, 2);
  });

  it("suma varias sesiones del mismo día", () => {
    const s = computePmc(
      [
        { date: "2026-01-01", tss: 40 },
        { date: "2026-01-01", tss: 60 },
      ],
      { start: "2026-01-01", end: "2026-01-01" },
    );
    expect(s[0].tss).toBe(100);
  });

  it("ACWR es null hasta tener 28 días de historia", () => {
    const s = computePmc([{ date: "2026-01-01", tss: 100 }], { start: "2026-01-01", end: "2026-01-30" });
    expect(s[26].acwr).toBeNull();
    expect(s[27].acwr).not.toBeNull();
    const cont = computePmc([], { start: "2026-03-01", end: "2026-03-01", seed: { ctl: 50, atl: 70 }, historyStart: "2026-01-01" });
    expect(cont[0].acwr).not.toBeNull();
  });

  it("rampRate necesita al menos 8 días", () => {
    const s = computePmc([{ date: "2026-01-01", tss: 100 }], { start: "2026-01-01", end: "2026-01-08" });
    expect(rampRate(s)).toBeCloseTo(s[7].ctl - s[0].ctl, 2);
    expect(rampRate(s.slice(0, 3))).toBeNull();
  });
});
