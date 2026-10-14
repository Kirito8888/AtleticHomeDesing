import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteCurve } from "@/lib/training/reference-curves-service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/training/reference-curves/[id]">) => {
  const user = await requireUser();
  await deleteCurve(user, (await ctx.params).id);
});
