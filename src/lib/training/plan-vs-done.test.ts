import { describe, expect, it } from "vitest";

import { planVsDone } from "./plan-vs-done";

const set = (reps: number, weightKg: number, isWarmup = false) => ({ reps, weightKg, rpe: null, isWarmup });

describe("planificado frente a hecho", () => {
  it("series efectivas, kg medio, tonelaje y lo que no estaba en el plan", () => {
    const r = planVsDone(
      [
        { exercise: "Sentadilla", exerciseId: "sq", sets: [set(6, 40, true), set(4, 80), set(4, 80), set(4, 80)] },
        { exercise: "Ejercicio raro", exerciseId: null, sets: [set(5, 0)] },
      ],
      [
        { exerciseId: "sq", exercise: "Sentadilla", reps: 4, weightKg: 80, isWarmup: false },
        { exerciseId: "sq", exercise: "Sentadilla", reps: 4, weightKg: 82.5, isWarmup: false },
        { exerciseId: "pull", exercise: "Dominadas", reps: 8, weightKg: 0, isWarmup: false },
      ],
    );
    expect(r[0]).toEqual({ exercise: "Sentadilla", exerciseId: "sq", plan: { sets: 3, reps: 12, avgKg: 80, tonnage: 960 }, done: { sets: 2, reps: 8, avgKg: 81.3, tonnage: 650 }, tonnagePct: -32 });
    expect(r[1]).toMatchObject({ exercise: "Ejercicio raro", done: null });
    expect(r[2]).toMatchObject({ exercise: "Dominadas", plan: null, done: { sets: 1, avgKg: null } });
  });
});
