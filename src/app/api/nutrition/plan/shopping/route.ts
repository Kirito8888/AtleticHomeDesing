import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { shoppingFromWeek } from "@/lib/nutrition/planning-service";

/** v1.7 · Lista de la compra con los ingredientes de la semana planificada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { week } = await parseBody(req, z.object({ week: isoDate }));
  return shoppingFromWeek(user.id, week);
});
