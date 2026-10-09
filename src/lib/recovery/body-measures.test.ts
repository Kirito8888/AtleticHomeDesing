import { describe, expect, it } from "vitest";

import { bodyMeasureSchema, measureChanges, skinfoldSum } from "./body-measures";

describe("antropometría", () => {
  it("exige al menos una medida", () => {
    expect(bodyMeasureSchema.safeParse({ date: "2026-10-01" }).success).toBe(false);
    expect(bodyMeasureSchema.safeParse({ date: "2026-10-01", girths: { brazo: 32 } }).success).toBe(true);
  });
  it("la suma de pliegues solo con los 6", () => {
    expect(skinfoldSum({ triceps: 10, subescapular: 9, supraespinal: 7, abdominal: 12, muslo: 14, gemelo: 8 })).toBe(60);
    expect(skinfoldSum({ triceps: 10 })).toBeNull();
  });
  it("cambio de la primera a la última toma", () => {
    const all = { triceps: 10, subescapular: 9, supraespinal: 7, abdominal: 12, muslo: 14, gemelo: 8 };
    const c = measureChanges([
      { date: "2026-09-01", girths: { brazo: 32 }, skinfolds: all },
      { date: "2026-10-01", girths: { brazo: 33.5, muslo: 56 }, skinfolds: { ...all, abdominal: 9 } },
    ]);
    expect(c.girths).toEqual([expect.objectContaining({ key: "brazo", diff: 1.5 })]);
    expect(c.skinfoldSum?.diff).toBe(-3);
  });
});
