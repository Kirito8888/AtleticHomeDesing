import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteSlot } from "@/lib/study/schedule-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/classes/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteSlot(user.id, id);
  return { ok: true };
});
