import "server-only";

import { z } from "zod";

import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { recipeMacros, type RecipeItem } from "@/lib/nutrition/kitchen";
import { searchLocalFoods } from "@/lib/nutrition/service";
import { prisma } from "@/lib/prisma";

/**
 * v1.10 · IA en Nutrición, con la IA del usuario y su permiso. Siempre en borrador: nada se anota ni
 * se planifica sin que la persona lo confirme. No se envía ningún dato de salud.
 */
const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

// 18 · Foto de la comida ------------------------------------------------------------------------
const photoSchema = z.object({
  items: z.array(z.object({ name: z.string().min(1).max(80), grams: z.number().min(1).max(2000) })).max(12),
});

const PHOTO_SYSTEM = `Identificas los alimentos de una foto de un plato o una comida y estimas los gramos de cada uno.
Nombres cortos en español, genéricos y buscables («arroz blanco cocido», «pechuga de pollo a la plancha»). Si no ves comida, devuelve una lista vacía. No inventes lo que no se ve.`;

export type PhotoDraftItem = { name: string; grams: number; match: { id: string; name: string; brand: string | null; kcalPer100g: number | null } | null };

/** La foto llega ya reescalada y sin EXIF (navegador); aquí no se guarda. */
export async function photoToDraft(userId: string, image: { mime: "image/jpeg" | "image/png"; base64: string }): Promise<{ items: PhotoDraftItem[]; model: string }> {
  let parsed: z.infer<typeof photoSchema>;
  let model = "simulado";
  if (fakeAi()) parsed = { items: [{ name: "arroz blanco cocido", grams: 150 }, { name: "pechuga de pollo", grams: 120 }] };
  else {
    await assertAiAllowed(userId);
    const r = await generateJson(photoSchema, { userId, system: PHOTO_SYSTEM, prompt: "¿Qué hay en esta comida y cuántos gramos aproximados de cada cosa?", images: [image], temperature: 0.2 });
    parsed = r.data;
    model = r.model;
  }
  const items: PhotoDraftItem[] = [];
  for (const it of parsed.items) {
    const found = (await searchLocalFoods(userId, it.name, 5)).find((p) => p.kcalPer100g != null);
    items.push({ name: it.name, grams: Math.round(it.grams), match: found ? { id: found.id, name: found.name, brand: found.brand, kcalPer100g: found.kcalPer100g } : null });
  }
  return { items, model };
}

// 40 · Plan de comidas de la semana --------------------------------------------------------------
const MEALS = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"] as const;
const planSchema = z.object({
  days: z.array(z.object({ date: z.string(), meals: z.array(z.object({ mealType: z.enum(MEALS), recipe: z.string().min(1).max(80), servings: z.number().min(0.5).max(4) })).max(5) })).max(7),
});

const PLAN_SYSTEM = `Planificas las comidas de una semana de un atleta solo con SUS recetas (usa el nombre exacto).
Ajusta raciones para acercarte a los objetivos diarios de energía y macronutrientes; varía las recetas y no repitas la misma comida dos días seguidos si hay alternativas. No añadas recetas que no estén en la lista.`;

export type PlanDraft = { weekStart: string; days: Array<{ date: string; meals: Array<{ mealType: (typeof MEALS)[number]; recipeId: string; recipe: string; servings: number; kcal: number; proteinG: number }>; kcal: number; proteinG: number }>; goal: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null; dropped: number; model: string };

export async function suggestMealPlan(userId: string, weekStart: string): Promise<PlanDraft> {
  const recipes = await prisma.recipe.findMany({ where: { userId }, select: { id: true, name: true, servings: true, items: true } });
  if (recipes.length < 3) throw new ApiError(422, "Crea al menos 3 recetas para que la IA pueda proponerte una semana (Nutrición → Recetas)", { code: "few_recipes" });
  const goal = await prisma.nutritionGoal.findFirst({ where: { userId, effectiveFrom: { lte: dateOnly(weekStart) } }, orderBy: { effectiveFrom: "desc" }, select: { kcal: true, proteinG: true, carbsG: true, fatG: true } });
  const info = recipes.map((r) => ({ ...r, per: recipeMacros(r.items as RecipeItem[], r.servings).perServing }));
  const dates = Array.from({ length: 7 }, (_, i) => toIsoDay(addDays(dateOnly(weekStart), i)));
  let raw: z.infer<typeof planSchema>;
  let model = "simulado";
  if (fakeAi()) {
    raw = { days: dates.map((date, d) => ({ date, meals: MEALS.slice(1, 4).map((mealType, k) => ({ mealType, recipe: info[(d + k) % info.length].name, servings: 1 })) })) };
  } else {
    await assertAiAllowed(userId);
    const prompt = JSON.stringify({
      semana: dates,
      objetivoDiario: goal,
      recetas: info.map((r) => ({ nombre: r.name, porRacion: r.per })),
    });
    const r = await generateJson(planSchema, { userId, system: PLAN_SYSTEM, prompt, temperature: 0.5 });
    raw = r.data;
    model = r.model;
  }
  // Solo recetas que existen y días de esa semana; lo demás se descarta (y se dice cuánto)
  const byName = new Map(info.map((r) => [r.name.trim().toLowerCase(), r]));
  let dropped = 0;
  const days = dates.map((date) => {
    const d = raw.days.find((x) => x.date === date);
    const meals = (d?.meals ?? []).flatMap((m) => {
      const r = byName.get(m.recipe.trim().toLowerCase());
      if (!r) {
        dropped++;
        return [];
      }
      const servings = Math.round(m.servings * 2) / 2;
      return [{ mealType: m.mealType, recipeId: r.id, recipe: r.name, servings, kcal: Math.round(r.per.kcal * servings), proteinG: Math.round(r.per.proteinG * servings) }];
    });
    return { date, meals, kcal: meals.reduce((a, m) => a + m.kcal, 0), proteinG: meals.reduce((a, m) => a + m.proteinG, 0) };
  });
  return { weekStart, days, goal, dropped, model };
}
