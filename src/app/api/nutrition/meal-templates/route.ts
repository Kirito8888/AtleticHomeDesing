import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { listMealTemplates, saveMealTemplate } from "@/lib/nutrition/meal-templates";
import { mealTypeEnum } from "@/lib/nutrition/service";

export const GET = route(async () => {
  const user = await requireUser();
  return listMealTemplates(user.id);
});

/** Guarda como favorita la comida `mealType` del día `date`. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80), date: isoDate, mealType: mealTypeEnum }));
  return NextResponse.json(await saveMealTemplate(user.id, b.name, b.date, b.mealType), { status: 201 });
});
