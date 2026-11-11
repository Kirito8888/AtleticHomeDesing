import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { readableScopes, requireUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, today } from "@/lib/dates";
import { hasStravaIn } from "@/lib/strava/policy";
import { explainPmc } from "@/lib/training/explain";
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
  const full = await getPerformanceSeries(userId, q.days);
  const own = userId === user.id;
  // Otra persona sin ámbito RECOVERY no recibe readiness, VFC, sueño, FC en reposo ni agujetas
  const recoveryOk = own || (await readableScopes(user, [userId])).get(userId)?.has("RECOVERY") === true;
  const REC_KEYS = ["readinessScore", "hrvRmssdMs", "sleepHours", "restingHr", "doms"];
  const drop = (keys: string[]) => (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
  const perf = recoveryOk
    ? full
    : { ...full, series: full.series.map(drop(REC_KEYS)), current: full.current ? { ...full.current, readiness: null } : null, recoveryHidden: true };
  const withWhy = <T extends { current: { ctl: number; atl: number; tsb: number; acwr: number | null; rampRate: number | null } | null }>(p: T) => ({
    ...p,
    explanation: p.current ? explainPmc(p.current) : null,
  });
  if (own) return withWhy(perf);
  // La carga (CTL/ATL) se calcula con todas las sesiones: con Strava en la ventana, otra persona no la ve
  const end = today();
  if (!(await hasStravaIn(userId, addDays(end, -(q.days + 120)), end))) return withWhy(perf);
  const LOAD_KEYS = ["tss", "ctl", "atl", "tsb", "acwr"];
  const strip = drop(LOAD_KEYS);
  return { ...perf, series: perf.series.map(strip), current: perf.current ? { readiness: perf.current.readiness } : null, explanation: null, loadHidden: true };
});
