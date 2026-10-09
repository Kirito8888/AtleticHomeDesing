import { z } from "zod";

import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({ name: z.string().trim().min(1).max(60), archived: z.boolean() }).partial();

/** Renombrar o archivar (archivar conserva el historial; borrar lo elimina). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/habits/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const data = await parsePatchBody(req, patchSchema);
  const { count } = await prisma.habit.updateMany({ where: { id, userId: user.id }, data });
  if (!count) throw new ApiError(404, "Hábito no encontrado");
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/habits/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.habit.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Hábito no encontrado");
  return { ok: true };
});
