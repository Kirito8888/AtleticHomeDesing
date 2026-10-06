import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { copyMeal } from "@/lib/nutrition/meal-templates";
import { mealTypeEnum } from "@/lib/nutrition/service";

/** Repite una comida de otro día: {fromDate, toDate, mealType, toMealType?} */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseBody(req, z.object({ fromDate: isoDate, toDate: isoDate, mealType: mealTypeEnum, toMealType: mealTypeEnum.optional() }));
  return NextResponse.json(await copyMeal(user.id, b.fromDate, b.toDate, b.mealType, b.toMealType), { status: 201 });
});
