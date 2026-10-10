import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { suggestMealPlan } from "@/lib/nutrition/food-ai";

/** v1.10 · Propuesta de la semana con tus recetas (IA). Solo borrador: no se guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiGenerate", user.id);
  const { weekStart } = await parseBody(req, z.object({ weekStart: isoDate }));
  return suggestMealPlan(user.id, weekStart);
});
