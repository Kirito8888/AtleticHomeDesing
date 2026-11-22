import { describe, expect, it } from "vitest";

import { decide, healthPayloadSchema, sameValue } from "./health-sync";

describe("tolerancias", () => {
  it("bordes por métrica", () => {
    expect(sameValue("sleepHours", 7.5, 7.6)).toBe(true);
    expect(sameValue("sleepHours", 7.5, 7.61)).toBe(false);
    expect(sameValue("hrvSdnnMs", 50, 51)).toBe(true);
    expect(sameValue("hrvSdnnMs", 50, 51.5)).toBe(false);
    expect(sameValue("restingHr", 52, 53)).toBe(true);
    expect(sameValue("restingHr", 52, 54)).toBe(false);
    expect(sameValue("bodyWeightKg", 62.3, 62.4)).toBe(true);
    expect(sameValue("bodyWeightKg", 62.3, 62.5)).toBe(false);
  });
});

describe("decide", () => {
  it("vacío → escribe", () => expect(decide("restingHr", null, 50)).toBe("write"));
  it("igual con tolerancia → conserva sin aviso", () => expect(decide("bodyWeightKg", 62.3, 62.4)).toBe("keep"));
  it("distinto y anotado → conflicto", () => expect(decide("bodyWeightKg", 62.3, 64)).toBe("conflict"));
  it("distinto pero el actual es lo que puso Apple → corrige", () => expect(decide("bodyWeightKg", 62.3, 64, 62.3)).toBe("write"));
  it("distinto de lo anotado aunque Apple escribiera otra cosa → conflicto", () => expect(decide("bodyWeightKg", 63, 64, 62.3)).toBe("conflict"));
  it("el 0 es un valor, no vacío", () => expect(decide("sleepHours", 0, 7)).toBe("conflict"));
});

describe("payload", () => {
  it("acepta coma, minutos y fecha ISO (día en Madrid)", () => {
    const r = healthPayloadSchema.parse({ date: "2026-11-21T23:30:00-05:00", sleepMin: "450", restingHr: "52,4", weightKg: "62,3" });
    expect(r).toEqual([{ date: "2026-11-22", sleepHours: 7.5, hrvSdnnMs: null, restingHr: 52, bodyWeightKg: 62.3 }]);
  });
  it("lote y fusión de días repetidos", () => {
    const r = healthPayloadSchema.parse({ days: [{ date: "2026-11-20", restingHr: 50 }, { date: "2026-11-20", weightKg: 60 }, { date: "2026-11-21", hrvSdnnMs: 40 }] });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ date: "2026-11-20", restingHr: 50, bodyWeightKg: 60 });
  });
  it("rechaza vacío, futuro, fuera de rango y más de 14 días", () => {
    expect(healthPayloadSchema.safeParse({ date: "2026-11-20" }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ date: "2999-01-01", restingHr: 50 }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ date: "2026-11-20", restingHr: 400 }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ date: "2026-11-20", weightKg: 10 }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ days: Array.from({ length: 15 }, () => ({ date: "2026-11-20", restingHr: 50 })) }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ date: "20/11/2026", restingHr: 50 }).success).toBe(false);
  });
});
