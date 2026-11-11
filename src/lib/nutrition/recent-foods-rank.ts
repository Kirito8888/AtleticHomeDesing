/** Ranking puro de alimentos recientes/habituales (sin BD, usable desde el cliente solo por sus tipos). */

export interface RecentRow {
  mealType: string;
  quantityG: number;
  createdAt: Date;
  customName: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  foodProduct: {
    id: string;
    name: string;
    brand: string | null;
    servingSizeG: number | null;
    kcalPer100g: number | null;
    proteinPer100g: number | null;
    carbsPer100g: number | null;
    fatPer100g: number | null;
    nutriScore: string | null;
  } | null;
}

export interface RecentFood {
  key: string;
  name: string;
  brand: string | null;
  /** Producto del catálogo (null = alimento manual). */
  product: {
    id: string;
    servingSizeG: number | null;
    kcalPer100g: number | null;
    proteinPer100g: number | null;
    carbsPer100g: number | null;
    fatPer100g: number | null;
    nutriScore: string | null;
  } | null;
  /** Valores por gramo de la última entrada manual (para reescalar). */
  perGram: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null } | null;
  usualG: number;
  kcal: number;
  count: number;
  lastAt: string;
  byMeal: Record<string, number>;
}

/** Moda de las cantidades; en empate gana la más reciente (las filas llegan de más nueva a más antigua). */
function usualQuantity(quantities: number[]): number {
  const counts = new Map<number, number>();
  for (const q of quantities) counts.set(q, (counts.get(q) ?? 0) + 1);
  let best = quantities[0]!;
  for (const q of quantities) if ((counts.get(q) ?? 0) > (counts.get(best) ?? 0)) best = q;
  return best;
}

/** Agrupa por producto (o nombre manual normalizado), ordena por frecuencia y luego recencia y corta en `limit`. */
export function rankRecentFoods(rowsNewestFirst: RecentRow[], limit: number): RecentFood[] {
  const groups = new Map<string, RecentRow[]>();
  for (const r of rowsNewestFirst) {
    const key = r.foodProduct ? `p:${r.foodProduct.id}` : r.customName?.trim() ? `c:${r.customName.trim().toLowerCase()}` : null;
    if (!key || !(r.quantityG > 0)) continue;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: RecentFood[] = [];
  for (const [key, rows] of groups) {
    const last = rows[0]!;
    const usualG = usualQuantity(rows.map((r) => r.quantityG));
    const byMeal: Record<string, number> = {};
    for (const r of rows) byMeal[r.mealType] = (byMeal[r.mealType] ?? 0) + 1;
    const p = last.foodProduct;
    const kcal = p ? ((p.kcalPer100g ?? 0) * usualG) / 100 : (last.kcal / last.quantityG) * usualG;
    out.push({
      key,
      name: p ? p.name : last.customName!.trim(),
      brand: p?.brand ?? null,
      product: p
        ? { id: p.id, servingSizeG: p.servingSizeG, kcalPer100g: p.kcalPer100g, proteinPer100g: p.proteinPer100g, carbsPer100g: p.carbsPer100g, fatPer100g: p.fatPer100g, nutriScore: p.nutriScore }
        : null,
      perGram: p
        ? null
        : {
            kcal: last.kcal / last.quantityG,
            proteinG: last.proteinG / last.quantityG,
            carbsG: last.carbsG / last.quantityG,
            fatG: last.fatG / last.quantityG,
            fiberG: last.fiberG == null ? null : last.fiberG / last.quantityG,
          },
      usualG,
      kcal: Math.round(kcal),
      count: rows.length,
      lastAt: last.createdAt.toISOString(),
      byMeal,
    });
  }
  return out.sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0)).slice(0, limit);
}

/** Primero lo más usado en la toma elegida; dentro de cada grupo se mantiene el orden por frecuencia/recencia. */
export function sortRecentsForMeal(list: RecentFood[], mealType: string): RecentFood[] {
  return [...list.filter((f) => f.byMeal[mealType]), ...list.filter((f) => !f.byMeal[mealType])];
}
