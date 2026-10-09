import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { habitSchema } from "@/lib/study/schedule";
import { habitsToday } from "@/lib/study/schedule-service";

/** Hábitos diarios con su racha · crear uno. */
export const GET = route(async () => {
  const user = await requireUser();
  return habitsToday(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { name } = await parseBody(req, habitSchema);
  return prisma.habit.create({ data: { userId: user.id, name }, select: { id: true } });
});
