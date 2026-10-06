import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteRm } from "@/lib/training/rm-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/training/rm/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteRm(user.id, id);
  return { ok: true };
});
