import { describe, expect, it } from "vitest";

import { mealNow, recipeMacros, shoppingFromFavorites } from "./kitchen";

describe("cocina", () => {
  it("qué toca comer según lo que falta para la prueba", () => {
    expect(mealNow(400)).toBeNull();
    expect(mealNow(200)).toBe(0);
    expect(mealNow(45)).toBe(1);
    expect(mealNow(-30)).toBe(2);
    expect(mealNow(-240)).toBe(3);
  });
  it("lista de la compra desde favoritas, sin repetir", () => {
    expect(
      shoppingFromFavorites(
        [{ items: [{ name: "Avena", grams: 60 }, { name: "Leche", grams: 250 }] }, { items: [{ name: "avena ", grams: 40 }, { name: "Plátano", grams: 120 }] }],
        ["plátano"],
      ),
    ).toEqual([
      { name: "Avena", qty: "100 g" },
      { name: "Leche", qty: "250 g" },
    ]);
  });
  it("macros de una receta por ración", () => {
    const r = recipeMacros(
      [
        { name: "Arroz", grams: 200, kcal100: 350, protein100: 7, carbs100: 78, fat100: 1 },
        { name: "Pollo", grams: 300, kcal100: 110, protein100: 23, carbs100: 0, fat100: 1.5 },
      ],
      2,
    );
    expect(r.total).toEqual({ grams: 500, kcal: 1030, proteinG: 83, carbsG: 156, fatG: 6.5 });
    expect(r.perServing).toEqual({ grams: 250, kcal: 515, proteinG: 41.5, carbsG: 78, fatG: 3.3 });
  });
});
