import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteMealPlanEntry } from "@/lib/nutrition/planning-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/nutrition/plan/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteMealPlanEntry(user.id, id);
  return { ok: true };
});
