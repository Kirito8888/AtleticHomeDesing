import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { trashMeal } from "@/lib/account/trash";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/nutrition/entries/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { id: trashId } = await trashMeal(user.id, id);
  return { ok: true, trashId };
});

/** Marcar o desmarcar como rico en hierro (salud de la mujer). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/nutrition/entries/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { ironRich } = await parseBody(req, z.object({ ironRich: z.boolean() }));
  const { count } = await prisma.macros.updateMany({ where: { id, userId: user.id }, data: { ironRich } });
  if (!count) throw new ApiError(404, "Entrada no encontrada");
  return { ok: true };
});
