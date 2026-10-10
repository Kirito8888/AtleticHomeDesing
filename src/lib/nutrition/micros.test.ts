import { describe, expect, it } from "vitest";

import { MICRO_INFO, microsForQuantity, microSummary, microTargets } from "./micros";

describe("micronutrientes", () => {
  it("calcula los de una toma a partir de los valores por 100 g (sin inventar los que faltan)", () => {
    expect(microsForQuantity({ calciumPer100g: 120, ironPer100g: 2, b12Per100g: null }, 250)).toMatchObject({ calciumMg: 300, ironMg: 5, b12Ug: null, vitDUg: null });
  });

  it("objetivos: los propios ganan; si no, la referencia según el sexo del perfil", () => {
    const t = microTargets({ calciumMg: 1200 }, "MALE");
    expect(t.calciumMg).toBe(1200);
    expect(t.ironMg).toBe(MICRO_INFO.ironMg.ref.male);
    expect(microTargets({}, null).ironMg).toBe(MICRO_INFO.ironMg.ref.female);
  });

  it("media diaria por días con algo anotado y qué parte de lo anotado trae el dato", () => {
    const rows = microSummary(
      [
        { date: "2026-10-01", calciumMg: 500, ironMg: 4 },
        { date: "2026-10-01", calciumMg: null, ironMg: 3 },
        { date: "2026-10-02", calciumMg: 700, ironMg: null },
      ],
      microTargets({}, "FEMALE"),
    );
    const ca = rows.find((r) => r.micro === "calciumMg")!;
    expect(ca).toMatchObject({ avg: 600, target: 950, pct: 63, coverage: 67 });
    expect(rows.find((r) => r.micro === "sodiumMg")).toMatchObject({ kind: "max", coverage: 0 });
  });
});
