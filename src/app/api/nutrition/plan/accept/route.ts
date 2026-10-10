import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { PLAN_MEALS, type PlanMeal } from "@/lib/nutrition/planning";
import { addMealPlanEntry } from "@/lib/nutrition/planning-service";

const schema = z.object({
  entries: z.array(z.object({ date: isoDate, mealType: z.enum(Object.keys(PLAN_MEALS) as [PlanMeal, ...PlanMeal[]]), recipeId: z.string().min(1), servings: z.number().min(0.5).max(10) })).min(1).max(40),
});

/** v1.10 · Aceptar la propuesta (entera o los días que elijas): crea las comidas del plan. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { entries } = await parseBody(req, schema);
  for (const e of entries) await addMealPlanEntry(user.id, e);
  return { added: entries.length };
});
