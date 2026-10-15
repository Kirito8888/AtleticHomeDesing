import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { compareCurve } from "@/lib/training/reference-curves-service";

/** Resultados del test frente a la curva. Cálculo local; con `?athlete=` la entrenadora necesita ámbito LOAD. */
export const GET = route(async (req, ctx: RouteContext<"/api/training/reference-curves/[id]/compare">) => {
  const user = await requireUser();
  return compareCurve(user, (await ctx.params).id, req.nextUrl.searchParams.get("athlete"));
});
