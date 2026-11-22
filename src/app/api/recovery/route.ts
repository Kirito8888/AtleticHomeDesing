import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { recoverySchema } from "@/lib/training/schemas";
import { upsertRecovery } from "@/lib/training/service";

const query = z.object({
  athleteId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, query);
  const userId = await resolveAthleteId(user, q.athleteId, "RECOVERY");
  const to = q.to ? dateOnly(q.to) : today();
  const from = q.from ? dateOnly(q.from) : addDays(to, -29);
  const rows = await prisma.recoveryMetrics.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
  // v3.1 B: peso, grasa y lo recibido de Apple Salud son de la dueña; una entrenadora con ámbito RECOVERY no los ve.
  return userId === user.id ? rows : rows.map(({ bodyWeightKg: _w, bodyFatPct: _f, healthSync: _h, ...rest }) => (void _w, void _f, void _h, rest));
});

/** Registro diario (upsert por fecha). Devuelve la fila con readinessScore calculado. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, recoverySchema);
  return upsertRecovery(user.id, input);
});
