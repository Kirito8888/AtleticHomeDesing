import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, today } from "@/lib/dates";
import { hasStravaIn } from "@/lib/strava/policy";
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
  const perf = await getPerformanceSeries(userId, q.days);
  if (userId === user.id) return perf;
  // La carga (CTL/ATL) se calcula con todas las sesiones: con Strava en la ventana, otra persona no la ve
  const end = today();
  if (!(await hasStravaIn(userId, addDays(end, -(q.days + 120)), end))) return perf;
  const LOAD_KEYS = ["tss", "ctl", "atl", "tsb", "acwr"];
  const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !LOAD_KEYS.includes(k)));
  return { ...perf, series: perf.series.map(strip), current: perf.current ? { readiness: perf.current.readiness } : null, loadHidden: true };
});
