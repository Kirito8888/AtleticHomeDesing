import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteWellbeing } from "@/lib/recovery/wellbeing-service";

type Ctx = RouteContext<"/api/recovery/wellbeing/[id]">;

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteWellbeing(user.id, id);
  return { ok: true };
});
