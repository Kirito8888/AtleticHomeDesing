import { describe, expect, it } from "vitest";

import { CAPTURE_FPS, computeAttempt, flightTime, fpsWarning, frameToTime, jumpHeight, jumpNotes, jumpSessionSchema, nearestFps, summarizeAttempts, takeoffVelocity, timeToFrame } from "./jump";

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
    expect(() => jumpSessionSchema.parse({ ...ok, fps: 90 })).toThrow();
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [{ takeoff: 130, landing: 10 }] })).toThrow();
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [{ takeoff: 0, landing: 1000 }] })).toThrow(); // > 1,5 s
    expect(() => jumpSessionSchema.parse({ ...ok, type: "dj" })).toThrow(); // sin contacto
    expect(jumpSessionSchema.parse({ ...ok, type: "dj", attempts: [{ contact: 0, takeoff: 10, landing: 130 }] }).type).toBe("dj");
    expect(() => jumpSessionSchema.parse({ ...ok, attempts: [] })).toThrow();
  });

  it("PAL y NTSC: el mismo vuelo da la misma altura", () => {
    // 0,500 s en cada frecuencia → 30,7 cm
    for (const [fps, n] of [[25, 12.5], [30, 15], [50, 25], [60, 30], [100, 50], [120, 60], [240, 120]] as const) {
      const t = flightTime(0, n, fps);
      expect(t).toBeCloseTo(0.5, 10);
      expect(+(jumpHeight(t) * 100).toFixed(1)).toBe(30.7);
    }
    expect(flightTime(0, 12, 25)).toBeCloseTo(0.48, 10);
    expect(flightTime(100, 150, 50)).toBe(1); // 50 fotogramas a 50 fps
    const dj = computeAttempt("dj", 50, { contact: 0, takeoff: 12, landing: 37 }); // contacto 0,24 s, vuelo 0,5 s
    expect(dj.contactS).toBeCloseTo(0.24, 10);
    expect(dj.flightS).toBeCloseTo(0.5, 10);
    expect(dj.rsi).toBeCloseTo(0.30656 / 0.24, 3);
  });

  it("el error de ±1 fotograma crece al bajar los fps", () => {
    expect(fpsWarning(100, 0.5)).toMatch(/10 ms/);
    expect(fpsWarning(50, 0.5)).toMatch(/20 ms/);
    expect(fpsWarning(25, 0.5)).toMatch(/40 ms/);
  });

  it("fps de captura admitidos: NTSC y PAL", () => {
    expect([...CAPTURE_FPS].sort((a, b) => a - b)).toEqual([25, 30, 50, 60, 100, 120, 240]);
    const ok = { type: "cmj", date: "2026-10-14", attempts: [{ takeoff: 0, landing: 25 }] };
    for (const fps of CAPTURE_FPS) expect(jumpSessionSchema.parse({ ...ok, fps }).fps).toBe(fps);
    for (const fps of [24, 48, 90, "50"]) expect(() => jumpSessionSchema.parse({ ...ok, fps })).toThrow();
  });

  it("fotograma ↔ instante sin deriva y redondeo de fps medidos", () => {
    for (const fps of [25, 30, 50, 240]) for (const f of [0, 1, 7, 99, 480]) expect(timeToFrame(frameToTime(f, fps), fps)).toBe(f);
    expect(nearestFps(49.8)).toBe(50);
    expect(nearestFps(29.97)).toBe(30);
    expect(nearestFps(239)).toBe(240);
  });
});
