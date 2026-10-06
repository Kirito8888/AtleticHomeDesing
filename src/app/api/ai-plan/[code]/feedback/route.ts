import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { submitWeekFeedback } from "@/lib/ai-plan/service";

const schema = z.object({
  week: z.number().int().min(1).max(52),
  rating: z.enum(["EASY", "OK", "HARD"]),
  pain: z.number().int().min(0).max(10).nullish(),
});

/** «¿Cómo fue la semana?» → ajusta la siguiente. */
export const POST = route(async (req, ctx: RouteContext<"/api/ai-plan/[code]/feedback">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const body = await parseBody(req, schema);
  return submitWeekFeedback(user.id, code, body.week, body.rating, body.pain ?? null);
});
