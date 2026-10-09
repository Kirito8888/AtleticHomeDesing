import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, today, toIsoDay } from "@/lib/dates";
import { deadlineSchema } from "@/lib/finance/trips";
import { listDeadlines } from "@/lib/finance/trips-service";
import { prisma } from "@/lib/prisma";

/** Plazos (inscripciones, licencia, becas): lista con los días que faltan · añadir. */
export const GET = route(async () => {
  const user = await requireUser();
  return listDeadlines(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const d = await parseBody(req, deadlineSchema);
  return prisma.deadline.create({ data: { userId: user.id, title: d.title, kind: d.kind, dueOn: dateOnly(d.dueOn), remindDays: d.remindDays, done: d.done }, select: { id: true } });
});
