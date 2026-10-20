import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { applyWeekFeedback } from "@/lib/ai-plan/service";

const schema = z.object({
  week: z.number().int().min(1).max(52),
  version: z.string().min(1).max(64),
});

/** Aplica al plan los cambios propuestos tras «¿Cómo fue la semana?» (una sola vez). */
export const POST = route(async (req, ctx: RouteContext<"/api/ai-plan/[code]/feedback/apply">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const body = await parseBody(req, schema);
  return applyWeekFeedback(user.id, code, body.week, body.version);
});
