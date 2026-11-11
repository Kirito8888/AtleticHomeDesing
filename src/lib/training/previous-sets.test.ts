import { describe, expect, it } from "vitest";

import { blocksToSets, newBlock } from "@/components/training/strength-logger";

import { prefillSets, summarizePrevious, type PreviousByExercise } from "./previous-sets";
import { restFor } from "./rest-timer";

const prev: PreviousByExercise = {
  sq: {
    date: "2026-11-05",
    sets: [
      { reps: 5, weightKg: 40, isWarmup: true, restSec: null },
      { reps: 5, weightKg: 80, isWarmup: false, restSec: 90 },
      { reps: 3, weightKg: 82.5, isWarmup: false, restSec: 90 },
    ],
  },
};

describe("precarga desde la sesión anterior", () => {
  it("sin historial no precarga y newBlock conserva el calentamiento de siempre", () => {
    expect(prefillSets(undefined)).toBeNull();
    expect(prefillSets({ date: "2026-11-05", sets: [] })).toBeNull();
    expect(newBlock("otro", prev).sets).toEqual([{ reps: 5, weightKg: 20, rpe: null, isWarmup: true }]);
  });

  it("con historial copia kg, reps, calentamiento y descanso, como referencia pendiente", () => {
    const b = newBlock("sq", prev);
    expect(b.sets).toHaveLength(3);
    expect(b.sets[1]).toMatchObject({ reps: 5, weightKg: 80, isWarmup: false, pending: true, prev: { kg: 80, reps: 5 }, keep: { restSec: 90 } });
    expect(b.sets[0].isWarmup).toBe(true);
  });

  it("las series pendientes no se guardan hasta marcarlas «Hecha»; el descanso prescrito se conserva", () => {
    const b = newBlock("sq", prev);
    expect(blocksToSets([b])).toEqual([]);
    b.sets[1] = { ...b.sets[1], pending: false, done: true, weightKg: 85 };
    expect(blocksToSets([b])).toEqual([expect.objectContaining({ exerciseId: "sq", reps: 5, weightKg: 85, restSec: 90 })]);
  });

  it("resume sin calentamiento", () => {
    expect(summarizePrevious(prev.sq)).toBe("80×5 · 82.5×3");
  });
});

describe("restFor", () => {
  it("usa el prescrito acotado a 15–600 s o, si falta, la preferencia", () => {
    expect(restFor(90, 120)).toBe(90);
    expect(restFor(null, 120)).toBe(120);
    expect(restFor(undefined, 120)).toBe(120);
    expect(restFor(0, 120)).toBe(120);
    expect(restFor(5, 120)).toBe(15);
    expect(restFor(5000, 120)).toBe(600);
  });
});
