import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { mealPlanEntrySchema } from "@/lib/nutrition/planning";
import { addMealPlanEntry, mealPlanWeek } from "@/lib/nutrition/planning-service";

/** v1.7 · Plan semanal de comidas (?week=lunes). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { week } = parseQuery(req, z.object({ week: isoDate }));
  return mealPlanWeek(user.id, week);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await addMealPlanEntry(user.id, await parseBody(req, mealPlanEntrySchema)), { status: 201 });
});
