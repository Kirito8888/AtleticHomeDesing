import { route } from "@/lib/api";
import { revokeInvitation } from "@/lib/auth/access";
import { requireAdmin } from "@/lib/auth/admin";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/admin/invitations/[id]">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await revokeInvitation(id);
  return { ok: true };
});
