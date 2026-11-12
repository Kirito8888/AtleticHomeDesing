import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate, toIsoDay, today } from "@/lib/dates";
import { nutritionDayView } from "@/lib/nutrition/day-view";

/** `GET /api/nutrition/day-view?date=` · Todo lo que pinta `/nutrition` para un día (por defecto hoy). Solo los datos del usuario de la sesión. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { date } = parseQuery(req, z.object({ date: isoDate.optional() }));
  return nutritionDayView(user.id, date ?? toIsoDay(today()));
});
