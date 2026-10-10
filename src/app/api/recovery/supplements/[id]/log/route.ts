import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** v1.7 · Marcar (o desmarcar) la toma de un día. Sin dosis: solo «tomado». */
export const POST = route(async (req, ctx: RouteContext<"/api/recovery/supplements/[id]/log">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { date, taken } = await parseBody(req, z.object({ date: isoDate, taken: z.boolean() }));
  const s = await prisma.supplement.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!s) throw new ApiError(404, "Suplemento no encontrado");
  const d = dateOnly(date);
  if (taken) await prisma.supplementLog.upsert({ where: { supplementId_date: { supplementId: id, date: d } }, create: { userId: user.id, supplementId: id, date: d }, update: {} });
  else await prisma.supplementLog.deleteMany({ where: { supplementId: id, date: d } });
  return { ok: true };
});
