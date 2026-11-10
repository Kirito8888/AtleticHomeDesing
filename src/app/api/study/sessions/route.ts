import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { studySessionSchema, studyWeek } from "@/lib/study/schedule";
import { logStudySession } from "@/lib/study/study-session-service";

/** Horas de estudio: resumen de una semana (lunes) · anotar un bloque (pomodoro o a mano). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { week } = parseQuery(req, z.object({ week: isoDate }));
  const from = dateOnly(week);
  const rows = await prisma.studySession.findMany({ where: { userId: user.id, date: { gte: from, lte: addDays(from, 6) } } });
  return studyWeek(rows.map((r) => ({ ...r, date: toIsoDay(r.date) })), week);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const s = await parseBody(req, studySessionSchema);
  const { id, ticked } = await logStudySession(user.id, s);
  return { id, ticked };
});
