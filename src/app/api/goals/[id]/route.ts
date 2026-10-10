import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { goalPatchSchema } from "@/lib/goals/goals";
import { deleteGoal, updateGoal } from "@/lib/goals/service";

type Ctx = RouteContext<"/api/goals/[id]">;

/** Progreso manual (solo «Otro») o marcar como conseguido. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateGoal(user.id, id, await parseBody(req, goalPatchSchema));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteGoal(user.id, id);
  return { ok: true };
});
