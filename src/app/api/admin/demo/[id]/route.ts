import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteDemoAccount } from "@/lib/demo/service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/demo/[id]">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await deleteDemoAccount(id);
  return { ok: true };
});
