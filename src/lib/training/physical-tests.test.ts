import { describe, expect, it } from "vitest";

import { summarizeTests, testDefinition, testResultSchema } from "./physical-tests";

// Valores inventados.
const row = (testKey: string, value: number, date: string, higherIsBetter = true) => ({ id: `${testKey}${date}`, testKey, name: testKey, unit: "m", higherIsBetter, value, date });

describe("tests físicos", () => {
  it("catálogo o propio, con clave estable", () => {
    expect(testDefinition(testResultSchema.parse({ test: "sprint30", value: 4.1, date: "2026-10-01" }))).toMatchObject({ testKey: "sprint30", higherIsBetter: false });
    expect(testDefinition(testResultSchema.parse({ test: "custom", customName: "Lanzamiento de peso atrás", customUnit: "m", value: 14, date: "2026-10-01" }))).toMatchObject({
      testKey: "custom:lanzamiento-de-peso-atras",
      unit: "m",
    });
    expect(() => testResultSchema.parse({ test: "custom", value: 1, date: "2026-10-01" })).toThrow();
  });

  it("mejor según el sentido del test y cambio como mejora", () => {
    const [sprint] = summarizeTests([row("sprint30", 4.2, "2026-09-01", false), row("sprint30", 4.0, "2026-10-01", false)]);
    expect(sprint).toMatchObject({ best: { value: 4.0 }, changePct: 4.8 });
    const [jump] = summarizeTests([row("cmj", 40, "2026-09-01"), row("cmj", 38, "2026-10-01")]);
    expect(jump).toMatchObject({ best: { value: 40 }, last: { value: 38 }, changePct: -5 });
  });
});
