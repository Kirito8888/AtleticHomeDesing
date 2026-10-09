import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const PATCH = route(async (req, ctx: RouteContext<"/api/nutrition/shopping/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { done } = await parseBody(req, z.object({ done: z.boolean() }));
  const { count } = await prisma.shoppingItem.updateMany({ where: { id, userId: user.id }, data: { done } });
  if (!count) throw new ApiError(404, "No encontrado");
  return { ok: true };
});
