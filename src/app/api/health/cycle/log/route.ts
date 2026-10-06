import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { cycleLogSchema } from "@/lib/health/cycle";
import { logCycleDay } from "@/lib/health/cycle-service";

/** Registro de un día: regla sí/no y síntomas (sin nada marcado, se borra el registro). */
export const POST = route(async (req) => {
  const user = await requireUser();
  await logCycleDay(user.id, await parseBody(req, cycleLogSchema));
  return { ok: true };
});
