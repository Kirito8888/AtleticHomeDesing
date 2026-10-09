import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { TESTS, type TestKey } from "@/lib/routine/questionnaire";
import { addRoutineTest } from "@/lib/routine/service";

/** Nuevo resultado de un test (retest): se dibuja sobre la proyección. */
export const POST = route(async (req, ctx: RouteContext<"/api/routine/[id]/tests">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ metric: z.enum(Object.keys(TESTS) as [TestKey, ...TestKey[]]), value: z.number().min(0).max(5000), date: isoDate }));
  return addRoutineTest(user.id, id, b.metric, b.value, b.date);
});
