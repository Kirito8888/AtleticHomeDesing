import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { examPlanSchema } from "@/lib/study/exam-plan";
import { examPlanView, generateExamPlan } from "@/lib/study/exam-plan-service";

/** Plan de estudio hasta los exámenes: ver · (re)generar los bloques sugeridos desde hoy. */
export const GET = route(async () => {
  const user = await requireUser();
  return examPlanView(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { hours } = await parseBody(req, examPlanSchema);
  return generateExamPlan(user.id, toIsoDay(today()), hours);
});
