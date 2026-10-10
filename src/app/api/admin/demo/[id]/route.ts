import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteDemoAccount } from "@/lib/demo/service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/demo/[id]">) => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo para administración");
  const { id } = await ctx.params;
  await deleteDemoAccount(id);
  return { ok: true };
});
