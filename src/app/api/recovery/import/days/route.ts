import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { saveRecoveryRows } from "@/lib/recovery/hrv-import-service";

const schema = z.object({
  days: z
    .array(z.object({ date: isoDate, sleepMin: z.number().int().min(0).max(960), restingHr: z.number().int().min(25).max(150).nullable() }))
    .min(1)
    .max(800),
});

/** Totales diarios ya calculados en el navegador (Apple Health): sueño y FC en reposo. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const { days } = await parseBody(req, schema);
  await saveRecoveryRows(
    user.id,
    days.map((d) => ({ date: d.date, hrvRmssdMs: null, restingHr: d.restingHr, sleepHours: d.sleepMin ? Math.round((d.sleepMin / 60) * 100) / 100 : null })),
  );
  return { imported: days.length };
});
