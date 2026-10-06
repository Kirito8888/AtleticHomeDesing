import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { getPerformanceSeries } from "@/lib/training/service";

const query = z.object({
  athleteId: z.string().optional(),
  days: z.coerce.number().int().min(7).max(730).default(90),
});

/** Serie PMC (TSS/CTL/ATL/TSB/ACWR) + recuperación (readiness, VFC, sueño, FC reposo). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, query);
  const userId = await resolveAthleteId(user, q.athleteId, "LOAD");
  return getPerformanceSeries(userId, q.days);
});
