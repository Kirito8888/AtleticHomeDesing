import { describe, expect, it } from "vitest";

import { estimateOneRm, repsInReserve, strengthSessionStress, tonnageKg } from "./strength";

describe("estimateOneRm", () => {
  it("1 rep al fallo = el propio peso", () => {
    expect(estimateOneRm(150, 1)).toBe(150);
  });
  it("Brzycki para ≤ 10 reps al fallo", () => {
    expect(estimateOneRm(100, 5)).toBeCloseTo((100 * 36) / 32);
  });
  it("suma el RIR a las reps hechas", () => {
    expect(estimateOneRm(100, 3, 2)).toBeCloseTo(estimateOneRm(100, 5)!);
  });
  it("Epley entre 11 y 15, null por encima", () => {
    expect(estimateOneRm(60, 12)).toBeCloseTo(60 * (1 + 12 / 30));
    expect(estimateOneRm(40, 20)).toBeNull();
  });
});

describe("tonelaje y series duras", () => {
  const sets = [
    { reps: 10, weightKg: 60, isWarmup: true },
    { reps: 5, weightKg: 100, rpe: 8 },
    { reps: 5, weightKg: 100, rir: 0 },
    { reps: 8, weightKg: 0, bodyweightFactor: 1, rpe: 6 },
  ];
  it("excluye calentamiento e incluye peso corporal", () => {
    expect(tonnageKg(sets, 80)).toBe(5 * 100 + 5 * 100 + 8 * 80);
  });
  it("pondera cada serie por (esfuerzo/0.8)²", () => {
    const { hardSets } = strengthSessionStress(sets);
    expect(hardSets).toBeCloseTo(1 + (1 / 0.8) ** 2 + (0.6 / 0.8) ** 2);
  });
  it("RIR se deriva de RPE si falta", () => {
    expect(repsInReserve({ rpe: 8.5 })).toBe(1.5);
    expect(repsInReserve({})).toBe(0);
  });
});
