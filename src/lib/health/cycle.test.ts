import { describe, expect, it } from "vitest";

import { cycleLength, cyclePhase, type CycleLogEntry, type CycleSettings, periodStarts, suggestLight } from "./cycle";

// Datos inventados para el test.
const settings = (over: Partial<CycleSettings> = {}): CycleSettings => ({
  avgLength: 28,
  periodDays: 5,
  lastStart: "2026-10-01",
  hormonal: "no",
  symptoms: ["dolor"],
  symptomParts: ["regla"],
  ...over,
});
const period = (date: string): CycleLogEntry => ({ date, period: true, symptoms: [] });

describe("ciclo menstrual (cálculo local)", () => {
  it("fases de un ciclo de 28 días", () => {
    const s = settings();
    expect(cyclePhase("2026-10-01", s, [])).toMatchObject({ day: 1, part: "regla" });
    expect(cyclePhase("2026-10-05", s, [])).toMatchObject({ day: 5, part: "regla" });
    expect(cyclePhase("2026-10-08", s, [])).toMatchObject({ day: 8, part: "folicular" });
    expect(cyclePhase("2026-10-14", s, [])).toMatchObject({ day: 14, part: "ovulacion" });
    expect(cyclePhase("2026-10-20", s, [])).toMatchObject({ day: 20, part: "lutea" });
    expect(cyclePhase("2026-10-26", s, [])).toMatchObject({ day: 26, part: "antes" });
    expect(cyclePhase("2026-10-29", s, [])).toMatchObject({ day: 1, part: "regla" }); // siguiente ciclo estimado
  });

  it("con anticonceptivo hormonal no se estiman fases; sin datos o con un retraso largo, tampoco", () => {
    expect(cyclePhase("2026-10-10", settings({ hormonal: "si" }), []).part).toBeNull();
    expect(cyclePhase("2026-10-10", settings({ lastStart: null }), []).part).toBeNull();
    expect(cyclePhase("2026-12-20", settings(), []).part).toBeNull(); // > 1,5 ciclos sin registrar
  });

  it("los registros mandan: duración media real e inicio registrado cerca del declarado", () => {
    const logs = ["2026-08-01", "2026-08-02", "2026-08-31", "2026-09-01", "2026-10-02", "2026-10-03"].map(period);
    expect(periodStarts(settings(), logs)).toEqual(["2026-08-01", "2026-08-31", "2026-10-01"]);
    expect(cycleLength(settings(), logs)).toBe(31); // 30 y 31 días → 30,5 → 31
    expect(cyclePhase("2026-10-02", settings(), logs).part).toBe("regla"); // registrado ese día
  });

  it("versión suave: por síntomas de hoy o por la parte del ciclo que marcó", () => {
    expect(suggestLight("2026-10-02", settings(), [])).toMatch(/durante la regla/);
    expect(suggestLight("2026-10-10", settings(), [])).toBeNull();
    expect(suggestLight("2026-10-10", settings(), [{ date: "2026-10-10", period: false, symptoms: ["fatiga"] }])).toMatch(/síntomas/);
    expect(suggestLight("2026-10-26", settings({ symptomParts: ["antes"] }), [])).toMatch(/antes de la regla/);
    expect(suggestLight("2026-10-02", null, [])).toBeNull();
  });
});
