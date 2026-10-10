import { describe, expect, it } from "vitest";

import { planDayMacros, shoppingFromPlan, supplementWeek, sweatRate } from "./v17-nutrition";

const rice = { name: "Arroz", grams: 300, kcal100: 350, protein100: 7, carbs100: 78, fat100: 1 };
const chicken = { name: "Pollo", grams: 400, kcal100: 120, protein100: 23, carbs100: 0, fat100: 2 };
const recipe = { servings: 4, items: [rice, chicken] };

describe("nutrición v1.7", () => {
  it("lista de la compra del plan: escala raciones, suma y no repite lo que ya hay", () => {
    const list = shoppingFromPlan([{ servings: 2, recipe }, { servings: 1, recipe }], ["pollo"]);
    expect(list).toEqual([{ name: "Arroz", qty: "225 g" }]);
  });

  it("macros planificados por día", () => {
    const m = planDayMacros([{ date: "2026-10-12", servings: 1, recipe }, { date: "2026-10-12", servings: 1, recipe }]);
    expect(m["2026-10-12"].kcal).toBe(2 * Math.round((300 * 3.5 + 400 * 1.2) / 4));
  });

  it("tasa de sudoración y lo que conviene beber para no pasar del 2 %", () => {
    const r = sweatRate({ minutes: 60, preKg: 70, postKg: 68.9, fluidMl: 500, urineMl: 100 });
    expect(r.sweatL).toBe(1.5);
    expect(r.rateLh).toBe(1.5);
    expect(r.lossPct).toBe(1.6);
    expect(r.overTwoPct).toBe(false);
    expect(r.drinkMlPerH).toBe(100); // 1,5 L/h − 1,4 L permitidos
    expect(sweatRate({ minutes: 90, preKg: 60, postKg: 60.2, fluidMl: 0, urineMl: 0 }).rateLh).toBe(0);
  });

  it("calendario de suplementos: lo que toca, lo marcado y el cumplimiento", () => {
    const w = supplementWeek(
      [
        { id: "a", name: "Hierro", days: [1, 3, 5], startedOn: null, endedOn: null },
        { id: "b", name: "Sin calendario", days: [], startedOn: null, endedOn: null },
        { id: "c", name: "Acabado", days: [1, 2, 3, 4, 5, 6, 7], startedOn: null, endedOn: "2026-10-13" },
      ],
      [{ supplementId: "a", date: "2026-10-12" }, { supplementId: "c", date: "2026-10-13" }],
      "2026-10-12",
    );
    expect(w.rows.map((r) => r.name)).toEqual(["Hierro", "Acabado"]);
    expect(w.rows[0].cells.filter((c) => c.scheduled).map((c) => c.date)).toEqual(["2026-10-12", "2026-10-14", "2026-10-16"]);
    expect(w.rows[1].cells.filter((c) => c.scheduled)).toHaveLength(2);
    expect(w.adherencePct).toBe(40); // 2 de 5
  });
});
