import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setBlockDone } from "@/lib/study/exam-plan-service";

/** Tachar o destachar un bloque de estudio a mano. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/study/exam-plan/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { done } = await parseBody(req, z.object({ done: z.boolean() }));
  await setBlockDone(user.id, id, done);
  return { ok: true };
});
