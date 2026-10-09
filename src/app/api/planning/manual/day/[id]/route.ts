import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { manualDaySchema, updateManualDay } from "@/lib/planning/manual-plan";

/** Guarda un día de un plan propio (título, duración, notas y tabla de ejercicios). */
export const PUT = route(async (req, ctx: RouteContext<"/api/planning/manual/day/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateManualDay(user.id, id, await parseBody(req, manualDaySchema));
});
