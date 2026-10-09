import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { classSlotSchema } from "@/lib/study/schedule";
import { createSlot, upcomingExamClashes } from "@/lib/study/schedule-service";

/** Horario de clases y exámenes, con los choques con entrenos de las próximas 2 semanas. */
export const GET = route(async () => {
  const user = await requireUser();
  return upcomingExamClashes(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createSlot(user.id, await parseBody(req, classSlotSchema));
});
