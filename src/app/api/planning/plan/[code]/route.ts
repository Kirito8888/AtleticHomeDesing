import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deletePlanMeso } from "@/lib/planning/plan-import/service";

/** Borra un bloque importado (sus sesiones planificadas y competiciones; las hechas se quedan). */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/planning/plan/[code]">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  return deletePlanMeso(user.id, decodeURIComponent(code));
});
