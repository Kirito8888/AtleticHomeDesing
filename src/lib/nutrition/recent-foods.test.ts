import { describe, expect, it } from "vitest";

import { rankRecentFoods, sortRecentsForMeal, type RecentRow } from "./recent-foods-rank";

const prod = (id: string, name = id) => ({ id, name, brand: null, servingSizeG: null, kcalPer100g: 100, proteinPer100g: 10, carbsPer100g: 20, fatPer100g: 5, nutriScore: null });
let n = 0;
const row = (o: Partial<RecentRow> & { p?: string }): RecentRow => ({
  mealType: "BREAKFAST",
  quantityG: 100,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, 0) - n++ * 1000), // cada fila nueva es más antigua
  customName: null,
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: null,
  foodProduct: o.p ? prod(o.p) : null,
  ...o,
});

describe("rankRecentFoods", () => {
  it("agrupa por producto y calcula la cantidad habitual (moda; empate → la más reciente)", () => {
    const r = rankRecentFoods([row({ p: "a", quantityG: 30 }), row({ p: "a", quantityG: 50 }), row({ p: "a", quantityG: 50 }), row({ p: "a", quantityG: 50 })], 10);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "p:a", count: 4, usualG: 50 });
    const tie = rankRecentFoods([row({ p: "b", quantityG: 40 }), row({ p: "b", quantityG: 90 })], 10);
    expect(tie[0]!.usualG).toBe(40);
  });

  it("los manuales se agrupan por nombre normalizado y guardan valores por gramo", () => {
    const r = rankRecentFoods([row({ customName: " Tostada ", quantityG: 80, kcal: 200, proteinG: 8 }), row({ customName: "tostada", quantityG: 40, kcal: 100 })], 10);
    expect(r).toHaveLength(1);
    expect(r[0]!.product).toBeNull();
    expect(r[0]!.perGram).toMatchObject({ kcal: 2.5, proteinG: 0.1 });
    expect(r[0]!.kcal).toBe(200);
  });

  it("ordena por frecuencia y luego recencia, y respeta el límite", () => {
    const rows = [row({ p: "x" }), row({ p: "y" }), row({ p: "y" }), row({ p: "z" })];
    expect(rankRecentFoods(rows, 10).map((f) => f.key)).toEqual(["p:y", "p:x", "p:z"]);
    expect(rankRecentFoods(rows, 2)).toHaveLength(2);
  });

  it("ignora filas sin identidad o con cantidad cero", () => {
    expect(rankRecentFoods([row({ customName: "  " }), row({ p: "q", quantityG: 0 })], 10)).toEqual([]);
  });

  it("sortRecentsForMeal pone primero lo usado en esa toma", () => {
    const list = rankRecentFoods([row({ p: "a", mealType: "LUNCH" }), row({ p: "a", mealType: "LUNCH" }), row({ p: "b", mealType: "DINNER" })], 10);
    expect(sortRecentsForMeal(list, "DINNER")[0]!.key).toBe("p:b");
    expect(sortRecentsForMeal(list, "LUNCH")[0]!.key).toBe("p:a");
  });
});
