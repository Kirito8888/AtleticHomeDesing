import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { routineAnswersSchema } from "@/lib/routine/questionnaire";
import { createRoutine, listRoutines } from "@/lib/routine/service";

/** v1.7 · Rutinas creadas con el cuestionario: listar · crear (plan en borrador, sin IA). */
export const GET = route(async () => {
  const user = await requireUser();
  return listRoutines(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createRoutine(user.id, await parseBody(req, routineAnswersSchema), toIsoDay(today()));
});
