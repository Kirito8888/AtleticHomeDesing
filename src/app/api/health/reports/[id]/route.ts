import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { revokeHealthReport } from "@/lib/health/health-report";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/health/reports/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await revokeHealthReport(user.id, id);
  return { ok: true };
});
