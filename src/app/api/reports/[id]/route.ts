import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { revokeReport } from "@/lib/report/service";

/** Revoca un enlace del informe. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/reports/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await revokeReport(user.id, id);
  return { ok: true };
});
