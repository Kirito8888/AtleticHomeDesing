import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteOwnFood } from "@/lib/nutrition/service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/nutrition/foods/[id]">) => {
  const user = await requireUser();
  await deleteOwnFood(user.id, (await ctx.params).id);
  return { ok: true };
});
