import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { recomputeSessionsTss } from "@/lib/training/service";

/** Recalcula TSS y PMC desde `from` (por defecto, todo el historial) con los umbrales de cada fecha. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ athleteId: z.string().optional(), from: isoDate.optional() }));
  const userId = await resolveAthleteId(user, body.athleteId, "write");
  return recomputeSessionsTss(userId, body.from ? dateOnly(body.from) : undefined);
});
