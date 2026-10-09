import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { tickStudyBlocks } from "@/lib/study/exam-plan-service";
import { studySessionSchema, studyWeek } from "@/lib/study/schedule";

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
  const row = await prisma.studySession.create({ data: { userId: user.id, subject: s.subject, minutes: s.minutes, date: dateOnly(s.date) }, select: { id: true } });
  // v1.6 · el pomodoro tacha los bloques del plan de estudio que ya cubre
  return { ...row, ticked: await tickStudyBlocks(user.id, s.subject, s.date) };
});
