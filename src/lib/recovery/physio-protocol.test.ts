import { describe, expect, it } from "vitest";

import { completion, currentPhase, normalizeProgress, painAllows, parsePhasesText, phasesToText, physioPhasesSchema } from "./physio-protocol";

const phases = physioPhasesSchema.parse([
  { name: "1 · Calmar", maxPain: 2, exercises: [{ name: "Isométricos", dose: "5×30 s" }], criteria: [{ text: "Sin dolor en reposo" }, { text: "Movilidad completa" }] },
  { name: "2 · Fuerza", maxPain: 3, exercises: [], criteria: [{ text: "Fuerza simétrica" }] },
]);

describe("protocolo de fisio", () => {
  it("normaliza el seguimiento a la forma del protocolo", () => {
    expect(normalizeProgress(phases, null)).toEqual([[false, false], [false]]);
    expect(normalizeProgress(phases, [[true], [true, true, true], [true]])).toEqual([[true, false], [true]]);
  });
  it("fase actual y avance", () => {
    expect(currentPhase(phases, [[true, false], [false]])).toBe(0);
    expect(currentPhase(phases, [[true, true], [false]])).toBe(1);
    expect(currentPhase(phases, [[true, true], [true]])).toBe(1);
    expect(completion(phases, [[true, true], [false]])).toEqual({ done: 2, total: 3, pct: 67 });
  });
  it("el dolor decide si se puede seguir", () => {
    expect(painAllows(phases, 0, 2)).toBe(true);
    expect(painAllows(phases, 0, 3)).toBe(false);
  });
  it("valida el esquema", () => {
    expect(physioPhasesSchema.safeParse([]).success).toBe(false);
    expect(physioPhasesSchema.safeParse([{ name: "", maxPain: 1, exercises: [], criteria: [] }]).success).toBe(false);
  });

  it("editor de texto: ida y vuelta, y errores con la línea", () => {
    expect(parsePhasesText(phasesToText(phases))).toEqual(phases);
    expect(parsePhasesText("# Fase | dolor máx 3 | meta\n- Puente: 3×10\n? Sin dolor")).toEqual([
      { name: "Fase", maxPain: 3, goal: "meta", exercises: [{ name: "Puente", dose: "3×10" }], criteria: [{ text: "Sin dolor" }] },
    ]);
    expect(() => parsePhasesText("- suelto")).toThrow(/Línea 1/);
    expect(() => parsePhasesText("# F\nhola")).toThrow(/Línea 2/);
  });
});
