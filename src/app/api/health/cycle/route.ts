import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { cycleSettingsSchema } from "@/lib/health/cycle";
import { deleteCycleData, getCycle, saveCycleSettings } from "@/lib/health/cycle-service";

// Ciclo menstrual: solo la propia usuaria (sin athleteId: el coach nunca accede).

export const GET = route(async () => {
  const user = await requireUser();
  return getCycle(user.id);
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  await saveCycleSettings(user.id, await parseBody(req, cycleSettingsSchema));
  return { ok: true };
});

/** Borra todos los datos del ciclo (ajustes y registros). */
export const DELETE = route(async () => {
  const user = await requireUser();
  await deleteCycleData(user.id);
  return { ok: true };
});
