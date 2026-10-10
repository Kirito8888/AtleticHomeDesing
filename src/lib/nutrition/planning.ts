// v1.7 · Nutrición: plan semanal de comidas con lista de la compra, tasa de sudoración y calendario de
// suplementos (sin dosis: la app no recomienda cantidades). Puro (sin BD).
import { z } from "zod";

import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";

import { type RecipeItem, recipeMacros, shoppingFromFavorites } from "./kitchen";

export const PLAN_MEALS = { BREAKFAST: "Desayuno", LUNCH: "Comida", SNACK: "Merienda", DINNER: "Cena" } as const;
export type PlanMeal = keyof typeof PLAN_MEALS;

export const mealPlanEntrySchema = z.object({
  date: isoDate,
  mealType: z.enum(Object.keys(PLAN_MEALS) as [PlanMeal, ...PlanMeal[]]),
  recipeId: z.string().min(1).max(40),
  servings: z.number().min(0.5).max(20).default(1),
});

type PlannedRecipe = { servings: number; recipe: { servings: number; items: RecipeItem[] } };

/** 18 · Ingredientes de las recetas planificadas, escalados a las raciones, sin repetir lo que ya está en la lista. */
export function shoppingFromPlan(entries: PlannedRecipe[], existing: string[]) {
  return shoppingFromFavorites(
    entries.map((e) => ({ items: e.recipe.items.map((i) => ({ name: i.name, grams: (i.grams * e.servings) / e.recipe.servings })) })),
    existing,
  );
}

/** Kcal y macros planificados por día (por ración de cada receta). */
export function planDayMacros(entries: Array<PlannedRecipe & { date: string }>) {
  const out = new Map<string, { kcal: number; proteinG: number; carbsG: number; fatG: number }>();
  for (const e of entries) {
    const per = recipeMacros(e.recipe.items, e.recipe.servings).perServing;
    const cur = out.get(e.date) ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    cur.kcal += per.kcal * e.servings;
    cur.proteinG += per.proteinG * e.servings;
    cur.carbsG += per.carbsG * e.servings;
    cur.fatG += per.fatG * e.servings;
    out.set(e.date, cur);
  }
  return Object.fromEntries([...out].map(([d, m]) => [d, { kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbsG: Math.round(m.carbsG), fatG: Math.round(m.fatG) }]));
}

export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => toIsoDay(addDays(dateOnly(weekStart), i)));

// 21 · Tasa de sudoración -------------------------------------------------------------------------
export const sweatTestSchema = z.object({
  date: isoDate,
  minutes: z.number().int().min(15).max(600),
  preKg: z.number().min(25).max(250),
  postKg: z.number().min(25).max(250),
  fluidMl: z.number().int().min(0).max(10000).default(0),
  urineMl: z.number().int().min(0).max(5000).default(0),
  tempC: z.number().min(-20).max(50).nullish(),
  notes: z.string().trim().max(200).nullish(),
});
export type SweatTest = z.infer<typeof sweatTestSchema>;

/**
 * Sudor (L/h) = (peso antes − peso después + líquido bebido − orina) / horas (1 kg ≈ 1 L).
 * Además: % del peso perdido y lo que convendría beber por hora para no pasar del 2 %
 * en una sesión igual de larga (referencia habitual; no es una pauta médica).
 */
export function sweatRate(t: Pick<SweatTest, "minutes" | "preKg" | "postKg" | "fluidMl" | "urineMl">) {
  const h = t.minutes / 60;
  const sweatL = t.preKg - t.postKg + t.fluidMl / 1000 - t.urineMl / 1000;
  const rate = Math.max(0, sweatL / h);
  const lossPct = ((t.preKg - t.postKg) / t.preKg) * 100;
  const allowedL = 0.02 * t.preKg;
  const drinkMlPerH = Math.max(0, Math.round(((rate * h - allowedL) / h) * 1000 / 50) * 50);
  return { sweatL: Math.round(sweatL * 100) / 100, rateLh: Math.round(rate * 100) / 100, lossPct: Math.round(lossPct * 10) / 10, drinkMlPerH, overTwoPct: lossPct > 2 };
}

// 20 · Calendario de suplementos (sin dosis) ----------------------------------------------------
export const supplementDaysSchema = z.object({ days: z.array(z.number().int().min(1).max(7)).max(7) });

/** Semana: qué toca cada día según `days` (1 = lunes) y si está marcado; cumplimiento de la semana. */
export function supplementWeek(supps: Array<{ id: string; name: string; days: number[]; startedOn: string | null; endedOn: string | null }>, logs: Array<{ supplementId: string; date: string }>, weekStart: string) {
  const days = weekDays(weekStart);
  const taken = new Set(logs.map((l) => `${l.supplementId}|${l.date}`));
  let due = 0;
  let done = 0;
  const rows = supps
    .filter((s) => s.days.length)
    .map((s) => ({
      id: s.id,
      name: s.name,
      cells: days.map((d, i) => {
        const active = (!s.startedOn || s.startedOn <= d) && (!s.endedOn || s.endedOn >= d);
        const scheduled = active && s.days.includes(i + 1);
        const isTaken = taken.has(`${s.id}|${d}`);
        if (scheduled) {
          due++;
          if (isTaken) done++;
        }
        return { date: d, scheduled, taken: isTaken };
      }),
    }));
  return { days, rows, adherencePct: due ? Math.round((done / due) * 100) : null };
}
