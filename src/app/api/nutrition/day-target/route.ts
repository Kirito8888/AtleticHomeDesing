import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { clearDayTarget, setDayTarget } from "@/lib/nutrition/service";

const body = z.object({
  date: isoDate,
  kcal: z.number().int().min(0).max(10000),
  proteinG: z.number().int().min(0).max(1500),
  carbsG: z.number().int().min(0).max(1500),
  fatG: z.number().int().min(0).max(1500),
});

/** `PUT /api/nutrition/day-target` · Marca a mano el objetivo de una fecha (prevalece sobre las reglas). */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { date, ...t } = await parseBody(req, body);
  await setDayTarget(user.id, date, t);
  return { ok: true };
});

/** `DELETE /api/nutrition/day-target?date=` · Vuelve al objetivo automático de esa fecha. */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { date } = parseQuery(req, z.object({ date: isoDate }));
  await clearDayTarget(user.id, date);
  return { ok: true };
});
