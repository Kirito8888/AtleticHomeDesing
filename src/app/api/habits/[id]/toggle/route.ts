import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { toggleHabit } from "@/lib/study/schedule-service";

/** Un toque: marca o desmarca el hábito ese día. */
export const POST = route(async (req, ctx: RouteContext<"/api/habits/[id]/toggle">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { date } = await parseBody(req, z.object({ date: isoDate }));
  return { done: await toggleHabit(user.id, id, date) };
});
