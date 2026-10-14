import { describe, expect, it } from "vitest";

import { filterEligible, plannedTss, resolveClashes, scenarios, type ScenarioInput } from "./what-if";

const base: ScenarioInput = {
  seed: { ctl: 50, atl: 50, date: "2026-03-01" },
  from: "2026-03-02",
  to: "2026-03-22",
  planned: [{ date: "2026-03-03", tss: 60 }],
  draft: [
    { date: "2026-03-03", tss: 80, isThrow: false },
    { date: "2026-03-05", tss: 80, isThrow: false },
    { date: "2026-03-18", tss: 80, isThrow: false },
  ],
  throwDates: [],
  minHours: 48,
};

describe("scenarios", () => {
  it("la copia sube la fatiga frente a no copiar", () => {
    const [b, c] = scenarios(base);
    expect(c.summary.atlPeak).toBeGreaterThan(b.summary.atlPeak);
    expect(c.summary.tsbMin).toBeLessThan(b.summary.tsbMin);
  });
  it("el afinamiento baja el pico de ATL en su ventana y no muta la entrada", () => {
    const copy = JSON.stringify(base);
    const s = scenarios({ ...base, taper: { from: "2026-03-15", competition: "2026-03-21", pct: 50 } });
    expect(JSON.stringify(base)).toBe(copy);
    const c = s.find((x) => x.id === "copy")!;
    const t = s.find((x) => x.id === "taper")!;
    const d = (x: typeof c) => x.series.find((p) => p.date === "2026-03-18")!;
    expect(d(t).tss).toBe(40);
    expect(d(t).atl).toBeLessThan(d(c).atl);
  });
  it("recoloca el día del borrador que choca con una sesión ya planificada", () => {
    const { days, moved } = resolveClashes(base);
    expect(moved).toEqual([{ from: "2026-03-03", to: expect.not.stringMatching(/^2026-03-03$/) }]);
    expect(days.find((d) => d.date === "2026-03-03")).toBeUndefined();
    expect(scenarios(base).some((x) => x.id === "reschedule")).toBe(true);
  });
  it("sin choques no hay escenario de recolocación", () => {
    expect(scenarios({ ...base, planned: [] }).some((x) => x.id === "reschedule")).toBe(false);
  });
});

describe("plannedTss", () => {
  it("usa el TSS guardado o sRPE (60 min a RPE 7 = 100)", () => {
    expect(plannedTss({ tss: 55, durationSec: 3600 }, 7)).toBe(55);
    expect(plannedTss({ tss: null, durationSec: 3600 }, 7)).toBeCloseTo(100, 5);
    expect(plannedTss({ tss: null, durationSec: null }, 7)).toBe(0);
  });
});

describe("filterEligible", () => {
  const g = (o: Partial<{ scopes: string[]; canPlan: boolean; restricted: boolean; linked: boolean }>) => ({ scopes: ["PLANNING"], canPlan: true, restricted: false, linked: true, ...o });
  it("solo deja pasar a quien tiene canPlan, PLANNING y no limitó el tratamiento", () => {
    const grants = new Map([
      ["ok", g({})],
      ["noplan", g({ canPlan: false })],
      ["noscope", g({ scopes: ["SESSIONS"] })],
      ["restr", g({ restricted: true })],
      ["nolink", g({ linked: false })],
    ]);
    const r = filterEligible(["ok", "noplan", "noscope", "restr", "nolink", "ghost", "ok"], grants);
    expect(r.ok).toEqual(["ok"]);
    expect(r.rejected.map((x) => x.id)).toEqual(["noplan", "noscope", "restr", "nolink", "ghost"]);
  });
});
