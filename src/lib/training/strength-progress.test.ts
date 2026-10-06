import { describe, expect, it } from "vitest";

import { e1rmChange, e1rmSeries, exercisesWithData, type SetRow } from "./strength-progress";

const row = (exerciseId: string, date: string, est1RmKg: number | null, weightKg = 100, reps = 5, isWarmup = false): SetRow => ({
  exerciseId,
  exerciseName: exerciseId === "sq" ? "Sentadilla" : "Press banca",
  date: new Date(`${date}T00:00:00Z`),
  est1RmKg,
  weightKg,
  reps,
  isWarmup,
});

describe("evolución del e1RM", () => {
  const rows = [
    row("sq", "2026-09-01", 50, 40, 5, true), // calentamiento: no cuenta
    row("sq", "2026-09-01", 116.7, 100, 5),
    row("sq", "2026-09-01", 120.3, 105, 4),
    row("sq", "2026-09-08", 125.04, 110, 4),
    row("bp", "2026-09-02", 90),
  ];

  it("toma el mejor e1RM de cada día, sin calentamientos, en orden", () => {
    expect(e1rmSeries(rows, "sq")).toEqual([
      { date: "2026-09-01", e1rm: 120.3, best: "105 kg × 4" },
      { date: "2026-09-08", e1rm: 125, best: "110 kg × 4" },
    ]);
  });

  it("lista ejercicios por días entrenados", () => {
    expect(exercisesWithData(rows).map((e) => [e.id, e.days])).toEqual([
      ["sq", 2],
      ["bp", 1],
    ]);
  });

  it("calcula la variación", () => {
    expect(e1rmChange(e1rmSeries(rows, "sq"))).toEqual({ kg: 4.7, pct: 3.9 });
    expect(e1rmChange(e1rmSeries(rows, "bp"))).toBeNull();
  });
});
