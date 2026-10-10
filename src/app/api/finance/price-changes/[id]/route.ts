import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { markPriceChangeSeen } from "@/lib/finance/season-service";

/** v1.7 · «Entendido» en un aviso de subida de precio. */
export const POST = route(async (_req, ctx: RouteContext<"/api/finance/price-changes/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await markPriceChangeSeen(user.id, id);
  return { ok: true };
});
