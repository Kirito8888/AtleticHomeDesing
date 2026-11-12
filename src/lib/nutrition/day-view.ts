import "server-only";

import { hydrationDay } from "@/lib/nutrition/hydration-service";
import { listMealTemplates, mealsOfPreviousDay } from "@/lib/nutrition/meal-templates";
import { recentFoods } from "@/lib/nutrition/recent-foods";
import { getDay } from "@/lib/nutrition/service";

/** Datos de `/nutrition` para un día (v2.11 B3 · O16): los usa la página y `GET /api/nutrition/day-view` para recargar solo la zona. */
export async function nutritionDayView(userId: string, date: string) {
  const [day, yesterday, favorites, water, recents] = await Promise.all([
    getDay(userId, date),
    mealsOfPreviousDay(userId, date),
    listMealTemplates(userId),
    hydrationDay(userId, date),
    recentFoods(userId),
  ]);
  return { day, yesterday, favorites, water, recents };
}
export type NutritionDayView = Awaited<ReturnType<typeof nutritionDayView>>;
