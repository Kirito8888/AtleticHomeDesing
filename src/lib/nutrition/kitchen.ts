// Nutrición v1.6: comida del día de competición, lista de la compra y recetas. Puro.
import { z } from "zod";

// 19 · Comida del día de competición (plantilla editable en Mis reglas; genérica: ajústala con tu nutricionista)
export const compMealSchema = z.object({ when: z.string().trim().min(1).max(40), what: z.string().trim().min(1).max(160) });
export const DEFAULT_COMP_MEALS = [
  { when: "3–4 h antes", what: "Comida rica en hidratos y conocida (arroz o pasta, algo de proteína magra, poca grasa y fibra)" },
  { when: "1 h antes", what: "Algo ligero: plátano, pan con mermelada o una barrita que ya hayas probado" },
  { when: "Entre rondas", what: "Sorbos de agua o bebida isotónica; algo pequeño si hay mucha espera" },
  { when: "Después", what: "Hidratos + proteína en la primera hora (bocadillo, yogur con fruta…) y rehidratarse" },
];

/** Lo que toca según los minutos que faltan para la prueba (null si aún no toca nada). */
export function mealNow(minutesToEvent: number): number | null {
  if (minutesToEvent > 300) return null;
  if (minutesToEvent > 120) return 0;
  if (minutesToEvent > 0) return 1;
  if (minutesToEvent > -180) return 2;
  return 3;
}

// 20 · Lista de la compra
export const shoppingItemSchema = z.object({ name: z.string().trim().min(1).max(80), qty: z.string().trim().max(40).nullish() });
/** Ingredientes de las favoritas elegidas, sin repetir lo que ya está en la lista (sin distinguir mayúsculas). */
export function shoppingFromFavorites(favorites: Array<{ items: Array<{ name: string; grams: number }> }>, existing: string[]) {
  const have = new Set(existing.map((x) => x.trim().toLowerCase()));
  const sum = new Map<string, { name: string; grams: number }>();
  for (const f of favorites)
    for (const it of f.items) {
      const k = it.name.trim().toLowerCase();
      if (!k || have.has(k)) continue;
      const cur = sum.get(k) ?? { name: it.name.trim(), grams: 0 };
      cur.grams += it.grams;
      sum.set(k, cur);
    }
  return [...sum.values()].map((x) => ({ name: x.name, qty: x.grams ? `${Math.round(x.grams)} g` : null }));
}

// 21 · Recetas propias
export const recipeItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: z.number().min(1).max(5000),
  kcal100: z.number().min(0).max(1000),
  protein100: z.number().min(0).max(100),
  carbs100: z.number().min(0).max(100),
  fat100: z.number().min(0).max(100),
});
export const recipeSchema = z.object({ name: z.string().trim().min(1).max(80), servings: z.number().min(1).max(50), items: z.array(recipeItemSchema).min(1).max(40) });
export type RecipeItem = z.infer<typeof recipeItemSchema>;

/** Macros totales y por ración (redondeo a 1 decimal; kcal enteras). */
export function recipeMacros(items: RecipeItem[], servings: number) {
  const t = items.reduce(
    (a, i) => ({ grams: a.grams + i.grams, kcal: a.kcal + (i.kcal100 * i.grams) / 100, proteinG: a.proteinG + (i.protein100 * i.grams) / 100, carbsG: a.carbsG + (i.carbs100 * i.grams) / 100, fatG: a.fatG + (i.fat100 * i.grams) / 100 }),
    { grams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const per = { grams: Math.round(t.grams / servings), kcal: Math.round(t.kcal / servings), proteinG: r1(t.proteinG / servings), carbsG: r1(t.carbsG / servings), fatG: r1(t.fatG / servings) };
  return { total: { grams: Math.round(t.grams), kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) }, perServing: per };
}
