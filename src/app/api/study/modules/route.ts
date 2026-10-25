import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { createModule, listModules } from "@/lib/study/modules-service";
import { moduleSchema } from "@/lib/study/study-route";

/** Asignaturas de estudio con su fecha de examen y los días que quedan. */
export const GET = route(async () => {
  const user = await requireUser();
  return listModules(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createModule(user.id, await parseBody(req, moduleSchema));
});
