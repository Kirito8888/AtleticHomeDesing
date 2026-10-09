import { describe, expect, it } from "vitest";

import { matchExercise, parseSpoken } from "./voice-parse";

describe("registrar por voz (parser local)", () => {
  it("ejercicios, series × reps, kg, RIR, minutos y RPE", () => {
    expect(parseSpoken("Sentadilla 3 por 5 a 90 kilos RIR 2, press banca cuatro x seis con 60,5, dominadas 3x8. 50 minutos, RPE 7")).toEqual({
      durationMin: 50,
      rpe: 7,
      items: [
        { exercise: "sentadilla", sets: 3, reps: 5, kg: 90, rir: 2 },
        { exercise: "press banca", sets: 4, reps: 6, kg: 60.5, rir: null },
        { exercise: "dominadas", sets: 3, reps: 8, kg: null, rir: null },
      ],
    });
    expect(parseSpoken("hoy nada especial")).toEqual({ durationMin: null, rpe: null, items: [] });
  });

  it("encuentra el ejercicio del catálogo", () => {
    const cat = [
      { id: "a", name: "Sentadilla trasera" },
      { id: "b", name: "Sentadilla frontal" },
      { id: "c", name: "Press banca" },
      { id: "d", name: "Press banca inclinado" },
    ];
    expect(matchExercise("press banca", cat)?.id).toBe("c");
    expect(matchExercise("sentadilla", cat)?.id).toBe("a"); // la más corta que empieza igual
    expect(matchExercise("remo", cat)).toBeNull();
  });
});
