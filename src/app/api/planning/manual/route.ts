import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createManualPlan, manualPlanSchema } from "@/lib/planning/manual-plan";

/** Crea un plan propio vacío (borrador) con los días de la semana elegidos. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return createManualPlan(user.id, await parseBody(req, manualPlanSchema));
});
