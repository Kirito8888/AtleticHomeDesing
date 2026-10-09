import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { deleteWomenData, saveWomenSettings, womenOverview } from "@/lib/health/women-service";

// Salud de la mujer: solo la propia usuaria (sin athleteId: el coach nunca accede).

export const GET = route(async () => {
  const user = await requireUser();
  return womenOverview(user.id, toIsoDay(today()));
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return saveWomenSettings(user.id, body);
});

/** Borra todos los datos de esta sección (ajustes y registros). */
export const DELETE = route(async () => {
  const user = await requireUser();
  await deleteWomenData(user.id);
  return { ok: true };
});
