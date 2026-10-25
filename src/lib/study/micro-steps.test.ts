import { describe, expect, it } from "vitest";

import { fakeSteps, normalizeSteps, STEP_LIMITS } from "@/lib/study/micro-steps";

const mk = (n: number, minutes = 40) => ({ title: "Tema", steps: Array.from({ length: n }, (_, i) => ({ action: `Paso distinto ${i}`, minutes })) });

describe("normalizeSteps", () => {
  it("corta a 6 pasos y acota los minutos a 5–15", () => {
    const r = normalizeSteps(mk(9));
    expect(r.steps).toHaveLength(STEP_LIMITS.maxSteps);
    expect(r.steps.every((s) => s.minutes === 15)).toBe(true);
    expect(normalizeSteps(mk(2, 1)).steps.every((s) => s.minutes === 5)).toBe(true);
    expect(r.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("quita vacíos, duplicados y marcas de markdown", () => {
    const r = normalizeSteps({
      title: "**Tema**",
      steps: [
        { action: "  ", minutes: 10 },
        { action: "- **Lee** el capítulo", minutes: 10 },
        { action: "Lee el capítulo", minutes: 7 },
        { action: "2) Resume `ATP`", minutes: 8, check: "**Una** frase" },
      ],
    });
    expect(r.title).toBe("Tema");
    expect(r.steps.map((s) => s.action)).toEqual(["Lee el capítulo", "Resume ATP"]);
    expect(r.steps[1].check).toBe("Una frase");
  });
  it("recorta acciones largas", () => {
    const r = normalizeSteps({ title: "T", steps: [{ action: "palabra ".repeat(40), minutes: 10 }] });
    expect(r.steps[0].action.length).toBeLessThanOrEqual(STEP_LIMITS.action);
  });
});

describe("fakeSteps", () => {
  it("da 4–6 pasos válidos", () => {
    const r = normalizeSteps(fakeSteps("Una idea. Otra idea. Tercera idea. Cuarta idea. Quinta idea."));
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    expect(r.steps.length).toBeLessThanOrEqual(6);
  });
});
