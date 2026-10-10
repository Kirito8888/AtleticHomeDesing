import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteRule } from "@/lib/finance/category-rules-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/category-rules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteRule(user.id, id);
  return { ok: true };
});
