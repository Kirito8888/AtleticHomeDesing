import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { duplicateWeek } from "@/lib/planning/manual-plan";

/** Copia la semana `from` en la siguiente. */
export const POST = route(async (req, ctx: RouteContext<"/api/planning/manual/[code]/duplicate">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const { from } = await parseBody(req, z.object({ from: z.number().int().min(1).max(16) }));
  return duplicateWeek(user.id, decodeURIComponent(code), from);
});
