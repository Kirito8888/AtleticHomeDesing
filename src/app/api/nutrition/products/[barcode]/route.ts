import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getFoodByBarcode } from "@/lib/nutrition/service";

/** Lookup por código de barras (lo usa el escáner). Caché local de 30 días. */
export const GET = route(async (_req, ctx: RouteContext<"/api/nutrition/products/[barcode]">) => {
  await requireUser();
  const { barcode } = await ctx.params;
  return getFoodByBarcode(barcode);
});
