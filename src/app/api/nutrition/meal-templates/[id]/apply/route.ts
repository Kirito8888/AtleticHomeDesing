import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { applyMealTemplate } from "@/lib/nutrition/meal-templates";
import { mealTypeEnum } from "@/lib/nutrition/service";

/** Registra una comida favorita en `date` (en su comida habitual o en `mealType`). */
export const POST = route(async (req, ctx: RouteContext<"/api/nutrition/meal-templates/[id]/apply">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ date: isoDate, mealType: mealTypeEnum.optional() }));
  return NextResponse.json(await applyMealTemplate(user.id, id, b.date, b.mealType), { status: 201 });
});
