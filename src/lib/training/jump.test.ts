import { describe, expect, it } from "vitest";

import { computeAttempt, flightTime, fpsWarning, jumpHeight, jumpNotes, jumpSessionSchema, summarizeAttempts, takeoffVelocity } from "./jump";

describe("medidor de salto por vídeo", () => {
  it("caso conocido: t = 0,500 s → 30,7 cm y 2,45 m/s", () => {
    const t = flightTime(100, 220, 240);
    expect(t).toBe(0.5);
    expect(+(jumpHeight(t) * 100).toFixed(1)).toBe(30.7);
    expect(+takeoffVelocity(t).toFixed(2)).toBe(2.45);
  });

  it("DJ: tiempo de contacto y RSI = altura / contacto", () => {
    const a = computeAttempt("dj", 240, { contact: 40, takeoff: 100, landing: 220 }); // contacto 0,25 s, vuelo 0,5 s
    expect(a.contactS).toBe(0.25);
    expect(a.rsi).toBeCloseTo(0.30656 / 0.25, 3);
    expect(computeAttempt("cmj", 240, { takeoff: 0, landing: 120 }).rsi).toBeNull();
  });

  it("mejor y media de los intentos", () => {
    const at = [120, 110, 100].map((d) => computeAttempt("cmj", 240, { takeoff: 0, landing: d }));
    const s = summarizeAttempts("cmj", at)!;
    expect(s.best.frames.landing).toBe(120);
    expect(s.bestValue).toBeCloseTo(30.656, 2);
    expect(s.mean).toBeCloseTo((at[0].heightCm + at[1].heightCm + at[2].heightCm) / 3, 6);
    expect(summarizeAttempts("cmj", [])).toBeNull();
  });

  it("aviso por debajo de 120 fps", () => {
    expect(fpsWarning(240)).toBeNull();
    expect(fpsWarning(120)).toBeNull();
    expect(fpsWarning(30, 0.5)).toMatch(/±1 fotograma.*cm/);
  });

  it("notas con fps y fotogramas, ≤ 200 caracteres", () => {
    expect(jumpNotes("cmj", 240, [{ takeoff: 1, landing: 121 }])).toBe("Vídeo 240 fps · 1 intento · fotogramas 1→121");
    expect(jumpNotes("dj", 240, [{ contact: 1, takeoff: 60, landing: 180 }])).toContain("1→60→180");
    const many = Array.from({ length: 10 }, () => ({ takeoff: 100000, landing: 100120 }));
    expect(jumpNotes("cmj", 240, many).length).toBeLessThanOrEqual(200);
  });

  it("validación de la sesión", () => {
    const ok = { type: "cmj", fps: 240, date: "2026-10-14", attempts: [{ takeoff: 10, landing: 130 }] };
    expect(jumpSessionSchema.parse(ok).fps).toBe(240);
    expect(() => jumpSessionSchema.parse({ ...ok, fps: 100 })).toThrow();
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [{ takeoff: 130, landing: 10 }] })).toThrow();
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [{ takeoff: 0, landing: 1000 }] })).toThrow(); // > 1,5 s
    expect(() => jumpSessionSchema.parse({ ...ok, type: "dj" })).toThrow(); // sin contacto
    expect(jumpSessionSchema.parse({ ...ok, type: "dj", attempts: [{ contact: 0, takeoff: 10, landing: 130 }] }).type).toBe("dj");
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [] })).toThrow();
  });
});
