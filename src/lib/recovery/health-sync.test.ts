import { describe, expect, it } from "vitest";

import { decide, healthPayloadSchema, sameValue } from "./health-sync";

describe("tolerancias", () => {
  it("bordes por métrica (v3.1 C: ±1 min, ±0,05 kg, ±1 lpm, ±1 ms)", () => {
    expect(sameValue("sleepHours", 7.5, 7.5 + 1 / 60)).toBe(true);
    expect(sameValue("sleepHours", 7.5, 7.5 + 1.5 / 60)).toBe(false);
    expect(sameValue("sleepHours", 7.5, 7.5 - 1 / 60)).toBe(true);
    expect(sameValue("sleepHours", 8, 8.0167)).toBe(true); // 481 min guardado con 4 decimales
    expect(sameValue("sleepHours", 8, 8.05)).toBe(false); // 3 min
    expect(sameValue("hrvSdnnMs", 50, 51)).toBe(true);
    expect(sameValue("hrvSdnnMs", 50, 51.1)).toBe(false);
    expect(sameValue("restingHr", 52, 53)).toBe(true);
    expect(sameValue("restingHr", 52, 54)).toBe(false);
    expect(sameValue("bodyWeightKg", 62.3, 62.35)).toBe(true);
    expect(sameValue("bodyWeightKg", 62.3, 62.25)).toBe(true);
    expect(sameValue("bodyWeightKg", 62.3, 62.36)).toBe(false);
    expect(sameValue("bodyWeightKg", 62.3, 62.4)).toBe(false);
  });
});

describe("decide", () => {
  it("vacío → escribe", () => expect(decide("restingHr", null, 50)).toBe("write"));
  it("igual con tolerancia → conserva sin aviso", () => expect(decide("bodyWeightKg", 62.3, 62.35)).toBe("keep"));
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
  it("unidades, coma y sueño con texto (v3.1 C)", () => {
    const r = healthPayloadSchema.parse({ date: "2026-11-21", sleep: "7 h 32 min", restingHr: "52 lpm", weightKg: "62,347 kg", hrvSdnnMs: "48,26 ms" });
    expect(r).toEqual([{ date: "2026-11-21", sleepHours: 7.5333, hrvSdnnMs: 48.3, restingHr: 52, bodyWeightKg: 62.35 }]);
  });
  it("sleepHours: número desnudo = horas; con unidad se respeta", () => {
    expect(healthPayloadSchema.parse({ date: "2026-11-21", sleepHours: 7.5 })[0].sleepHours).toBe(7.5);
    expect(healthPayloadSchema.parse({ date: "2026-11-21", sleepHours: "7,5" })[0].sleepHours).toBe(7.5);
    expect(healthPayloadSchema.parse({ date: "2026-11-21", sleepHours: "450 min" })[0].sleepHours).toBe(7.5);
    expect(healthPayloadSchema.safeParse({ date: "2026-11-21", sleepHours: 450 }).success).toBe(false);
  });
  it("sueño que cruza medianoche cuenta para el día del despertar", () => {
    const r = healthPayloadSchema.parse({ sleepStart: "2026-11-21T23:40:00", sleepEnd: "2026-11-22T07:10:00" });
    expect(r).toEqual([{ date: "2026-11-22", sleepHours: 7.5, hrvSdnnMs: null, restingHr: null, bodyWeightKg: null }]);
  });
  it("date distinto del despertar: el sueño va a su día y el resto a date", () => {
    const r = healthPayloadSchema.parse({ date: "2026-11-21", sleepStart: "2026-11-21T23:40:00", sleepEnd: "2026-11-22T07:10:00", weightKg: 62.3 });
    expect(r).toHaveLength(2);
    expect(r.find((d) => d.date === "2026-11-22")).toMatchObject({ sleepHours: 7.5, bodyWeightKg: null });
    expect(r.find((d) => d.date === "2026-11-21")).toMatchObject({ sleepHours: null, bodyWeightKg: 62.3 });
  });
  it("hora de Madrid cerca de medianoche, con y sin zona", () => {
    expect(healthPayloadSchema.parse({ date: "2026-11-21T23:50:00", restingHr: 50 })[0].date).toBe("2026-11-21");
    expect(healthPayloadSchema.parse({ date: "2026-11-21T23:10:00Z", restingHr: 50 })[0].date).toBe("2026-11-22");
    expect(healthPayloadSchema.parse({ date: "2026-11-22 00:10:00 +0100", restingHr: 50 })[0].date).toBe("2026-11-22");
  });
  it("fin del sueño anterior al inicio → rechazo; sin fecha ni sleepEnd → rechazo", () => {
    expect(healthPayloadSchema.safeParse({ sleepStart: "2026-11-22T07:10:00", sleepEnd: "2026-11-21T23:40:00" }).success).toBe(false);
    expect(healthPayloadSchema.safeParse({ restingHr: 50 }).success).toBe(false);
  });
});
