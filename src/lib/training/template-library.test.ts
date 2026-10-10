import { describe, expect, it } from "vitest";

import { remapExercises } from "@/lib/training/template-library";

describe("biblioteca de la entrenadora", () => {
  it("cambia solo los ejercicios propios", () => {
    const p = { type: "STRENGTH", strength: { sets: [{ exerciseId: "coach-1", reps: 5 }, { exerciseId: "global-squat", reps: 3 }] } };
    const out = remapExercises(p, new Map([["coach-1", "mine-1"]])) as typeof p;
    expect(out.strength.sets.map((s) => s.exerciseId)).toEqual(["mine-1", "global-squat"]);
    expect(p.strength.sets[0].exerciseId).toBe("coach-1");
  });
  it("sin fuerza no toca nada", () => {
    const p = { type: "TRACK", track: {} };
    expect(remapExercises(p, new Map())).toBe(p);
  });
});
