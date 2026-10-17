import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteFvSeries } from "@/lib/training/fv-profile-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/training/tests/fv/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteFvSeries(user.id, id);
  return { ok: true };
});
