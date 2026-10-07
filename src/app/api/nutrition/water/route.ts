import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { addWater, hydrationDay, undoWater, waterSchema } from "@/lib/nutrition/hydration-service";

/** Agua del día: total y objetivo · anotar · deshacer la última. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { date } = parseQuery(req, z.object({ date: isoDate }));
  return hydrationDay(user.id, date);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return addWater(user.id, await parseBody(req, waterSchema));
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { date } = parseQuery(req, z.object({ date: isoDate }));
  await undoWater(user.id, date);
  return { ok: true };
});
