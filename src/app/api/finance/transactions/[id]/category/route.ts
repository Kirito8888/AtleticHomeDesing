import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { categorizeSchema } from "@/lib/finance/category-rules";
import { categorizeTransaction } from "@/lib/finance/category-rules-service";

/** v1.8 · Categoría de un movimiento; con similar=true aprende la regla y la aplica a los parecidos. */
export const PUT = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]/category">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { categoryId, similar } = await parseBody(req, categorizeSchema);
  return categorizeTransaction(user.id, id, categoryId, similar);
});
