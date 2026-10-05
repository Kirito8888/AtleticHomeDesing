import { describe, expect, it } from "vitest";

import { computeReadiness, hrvScore, sleepScore, tsbScore, wellnessScore } from "./readiness";

const stableHrv = [60, 62, 58, 61, 59, 60, 63, 57];

describe("componentes", () => {
  it("VFC en la media → 75; una caída clara baja la puntuación", () => {
    expect(hrvScore(60, stableHrv)!.score).toBeGreaterThan(65);
    expect(hrvScore(45, stableHrv)!.score).toBeLessThan(30);
  });
  it("VFC sin línea base suficiente → null", () => {
    expect(hrvScore(60, [60, 61])).toBeNull();
  });
  it("sueño: 8 h y calidad 5 = 100; 6 h penaliza", () => {
    expect(sleepScore(8, 5)).toBe(100);
    expect(sleepScore(6, null)).toBeCloseTo(60);
  });
  it("TSB mapea a 0–100", () => {
    expect(tsbScore(0)).toBe(70);
    expect(tsbScore(-40)).toBe(0);
    expect(tsbScore(20)).toBe(100);
  });
  it("bienestar invierte fatiga y estrés", () => {
    expect(wellnessScore(1, 1, 5)).toBe(100);
    expect(wellnessScore(5, 5, 1)).toBe(0);
  });
});

describe("computeReadiness", () => {
  it("atleta descansado y en forma → READY", () => {
    const r = computeReadiness({
      hrvRmssdMs: 64,
      hrvHistory: stableHrv,
      restingHr: 48,
      restingHrHistory: [50, 51, 49, 50, 52, 50],
      sleepHours: 8.2,
      sleepQuality: 4,
      doms: 1,
      tsb: 5,
      fatigue: 2,
      stress: 2,
      mood: 4,
    });
    expect(r.label).toBe("READY");
    expect(r.context.usedWeight).toBe(1);
  });

  it("VFC hundida + poco sueño + TSB muy negativo → RECOVER", () => {
    const r = computeReadiness({
      hrvRmssdMs: 42,
      hrvHistory: stableHrv,
      sleepHours: 5,
      tsb: -30,
      doms: 7,
    });
    expect(r.label).toBe("RECOVER");
    expect(r.score).toBeLessThan(50);
  });

  it("renormaliza pesos cuando faltan componentes", () => {
    const r = computeReadiness({ sleepHours: 8, sleepQuality: 5, tsb: 15 });
    expect(r.context.usedWeight).toBe(0.4);
    expect(r.score).toBe(100);
  });

  it("no da número con menos del 30 % de la información", () => {
    expect(computeReadiness({ doms: 2 }).score).toBeNull();
  });
});
