import { describe, expect, it } from "vitest";

import { adherence, prehabRoutineSchema } from "./prehab";

describe("prehabilitación", () => {
  it("valida plantilla o rutina propia", () => {
    expect(prehabRoutineSchema.safeParse({ template: "shoulder" }).success).toBe(true);
    expect(prehabRoutineSchema.safeParse({ name: "Mía", exercises: [{ name: "Goma", dose: "2 × 15" }] }).success).toBe(true);
    expect(prehabRoutineSchema.safeParse({ name: "Mía", exercises: [] }).success).toBe(false);
  });
  it("cuenta la semana (lunes a hoy) y los últimos 7 días", () => {
    // 2026-10-08 es jueves
    const a = adherence(["2026-10-04", "2026-10-05", "2026-10-07", "2026-10-08"], "2026-10-08");
    expect(a.thisWeek).toBe(3);
    expect(a.doneToday).toBe(true);
    expect(a.last7.filter((d) => d.done)).toHaveLength(4);
  });
});
