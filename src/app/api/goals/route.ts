import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { goalSchema } from "@/lib/goals/goals";
import { createGoal, listGoals } from "@/lib/goals/service";

/** v1.8 · Objetivos con el progreso calculado. */
export const GET = route(async () => {
  const user = await requireUser();
  return listGoals(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await createGoal(user.id, await parseBody(req, goalSchema)), { status: 201 });
});
