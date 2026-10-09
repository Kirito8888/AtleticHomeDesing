import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** Un toque: marca o desmarca la rutina ese día. */
export const POST = route(async (req, ctx: RouteContext<"/api/training/prehab/[id]/toggle">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { date } = await parseBody(req, z.object({ date: isoDate }));
  const r = await prisma.prehabRoutine.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!r) throw new ApiError(404, "Rutina no encontrada");
  const d = dateOnly(date);
  const { count } = await prisma.prehabLog.deleteMany({ where: { routineId: id, date: d } });
  if (count) return { done: false };
  await prisma.prehabLog.upsert({ where: { routineId_date: { routineId: id, date: d } }, create: { userId: user.id, routineId: id, date: d }, update: {} });
  return { done: true };
});
