import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { activateAiPlan } from "@/lib/ai-plan/service";

/** Pasa el borrador a los entrenamientos (crea las sesiones planificadas). */
export const POST = route(async (_req, ctx: RouteContext<"/api/ai-plan/[code]/activate">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  return activateAiPlan(user.id, code);
});
