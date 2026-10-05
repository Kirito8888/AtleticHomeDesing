import { describe, expect, it } from "vitest";

import {
  banisterTrimp,
  computeSessionTss,
  hrTss,
  runPaceTss,
  srpeTss,
  swimPaceTss,
  technicalAttemptsTss,
} from "./tss";

const thresholds = { hrRest: 50, hrMax: 195, lthr: 170, thresholdPaceSecPerKm: 240, thresholdPaceSecPer100mSwim: 100 };

describe("hrTSS", () => {
  it("vale 100 para 1 h exactamente en LTHR", () => {
    expect(hrTss({ durationSec: 3600, hrAvg: 170, thresholds })).toBeCloseTo(100, 6);
  });
  it("escala linealmente con la duración a igual FC", () => {
    expect(hrTss({ durationSec: 1800, hrAvg: 170, thresholds })).toBeCloseTo(50, 6);
  });
  it("una FC más baja produce menos de lo proporcional (curva exponencial)", () => {
    const easy = hrTss({ durationSec: 3600, hrAvg: 130, thresholds })!;
    expect(easy).toBeLessThan(50);
    expect(easy).toBeGreaterThan(20);
  });
  it("usa la constante femenina de Banister", () => {
    expect(banisterTrimp(60, 150, 50, 190, "FEMALE")).not.toBeCloseTo(banisterTrimp(60, 150, 50, 190, "MALE"), 3);
  });
  it("devuelve null si faltan umbrales o son incoherentes", () => {
    expect(hrTss({ durationSec: 3600, hrAvg: 150, thresholds: { hrRest: 50, hrMax: 190 } })).toBeNull();
    expect(hrTss({ durationSec: 3600, hrAvg: 150, thresholds: { hrRest: 60, hrMax: 190, lthr: 200 } })).toBeNull();
  });
});

describe("TSS por ritmo", () => {
  it("rTSS = 100 a ritmo umbral durante 1 h", () => {
    expect(runPaceTss(3600, 240, 240)).toBeCloseTo(100);
  });
  it("rTSS aumenta con el cuadrado de la intensidad", () => {
    expect(runPaceTss(3600, 200, 240)).toBeCloseTo(144);
  });
  it("natación usa IF al cubo", () => {
    expect(swimPaceTss(3600, 90, 100)).toBeCloseTo((100 / 90) ** 3 * 100);
  });
});

describe("sRPE y técnica", () => {
  it("60 min a RPE 7 = 100 y es lineal en RPE y en duración (Foster)", () => {
    expect(srpeTss(3600, 7)).toBeCloseTo(100);
    expect(srpeTss(5400, 8)).toBeCloseTo((8 * 90) / 420 * 100);
    expect(srpeTss(3600, 3.5)).toBeCloseTo(50);
  });
  it("técnica: intentos × 1.5 a intensidad de referencia", () => {
    expect(technicalAttemptsTss(20)).toBeCloseTo(30);
    expect(technicalAttemptsTss(0)).toBeNull();
  });
});

describe("computeSessionTss", () => {
  it("prioriza FC sobre ritmo y sRPE en pista", () => {
    const r = computeSessionTss({
      type: "TRACK",
      durationSec: 3600,
      sessionRpe: 6,
      thresholds,
      track: { modality: "RUN", movingTimeSec: 3600, hrAvg: 170, avgPaceSecPerKm: 240 },
    });
    expect(r.method).toBe("HR_TSS");
    expect(r.tss).toBeCloseTo(100, 0);
    expect(Object.keys(r.candidates).sort()).toEqual(["HR_TSS", "PACE_TSS", "SRPE"]);
  });
  it("en fuerza usa sRPE si hay duración y RPE; si no, el modelo por series", () => {
    const sets = Array.from({ length: 10 }, () => ({ reps: 5, weightKg: 100, rpe: 8 }));
    const withRpe = computeSessionTss({ type: "STRENGTH", durationSec: 3600, sessionRpe: 7, strength: { sets } });
    expect(withRpe.method).toBe("SRPE");
    const withoutRpe = computeSessionTss({ type: "STRENGTH", strength: { sets } });
    expect(withoutRpe.method).toBe("TONNAGE");
    expect(withoutRpe.tss).toBeCloseTo(50);
  });
  it("respeta un TSS manual", () => {
    const r = computeSessionTss({ type: "TECHNICAL", manualTss: 42, technical: { attempts: 10 } });
    expect(r).toMatchObject({ tss: 42, method: "MANUAL" });
  });
  it("devuelve null sin datos suficientes", () => {
    expect(computeSessionTss({ type: "MIXED" }).tss).toBeNull();
  });
});
