import { describe, expect, it } from "vitest";

import { goalProgress, goalSchema } from "@/lib/goals/goals";

describe("goalProgress", () => {
  it("más es mejor (jabalina 50 m)", () => {
    expect(goalProgress({ kind: "MARK", target: 50, higherIsBetter: true }, 45)).toEqual({ current: 45, pct: 0.9, reached: false });
    expect(goalProgress({ kind: "MARK", target: 50, higherIsBetter: true }, 51).reached).toBe(true);
  });
  it("menos es mejor (30 m en 4,0 s)", () => {
    const p = goalProgress({ kind: "TEST", target: 4, higherIsBetter: false }, 4.2);
    expect(p.reached).toBe(false);
    expect(p.pct).toBeCloseTo(0.952, 2);
    expect(goalProgress({ kind: "TEST", target: 4, higherIsBetter: false }, 3.95).reached).toBe(true);
  });
  it("gasto del mes: dentro mientras no se pase", () => {
    expect(goalProgress({ kind: "BUDGET", target: 10000, higherIsBetter: false }, 2500)).toEqual({ current: 2500, pct: 0.25, reached: true });
    expect(goalProgress({ kind: "BUDGET", target: 10000, higherIsBetter: false }, 12000).reached).toBe(false);
  });
  it("sin datos todavía", () => {
    expect(goalProgress({ kind: "HABIT", target: 30, higherIsBetter: true }, null)).toEqual({ current: null, pct: 0, reached: false });
  });
  it("exige el enlace salvo en los manuales", () => {
    expect(goalSchema.safeParse({ kind: "MARK", title: "50 m", target: 50 }).success).toBe(false);
    expect(goalSchema.safeParse({ kind: "CUSTOM", title: "Leer 12 libros", target: 12 }).success).toBe(true);
  });
});
