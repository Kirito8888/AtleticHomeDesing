import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { DESCRIPTION_MAX, deleteExercise, getExercise, updateExercise } from "@/lib/training/exercise-library";

type Ctx = RouteContext<"/api/training/exercises/[id]">;

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ownerId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athlete"), "SESSIONS");
  return getExercise(ownerId, id);
});

const patch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(DESCRIPTION_MAX).nullish().transform((v) => v || null).optional() });

export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateExercise(user.id, id, await parseBody(req, patch));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteExercise(user.id, id);
  return new NextResponse(null, { status: 204 });
});
