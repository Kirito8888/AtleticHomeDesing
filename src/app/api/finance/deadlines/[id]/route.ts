import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { deadlineSchema } from "@/lib/finance/trips";
import { prisma } from "@/lib/prisma";

export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/deadlines/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { dueOn, ...rest } = await parsePatchBody(req, deadlineSchema);
  const { count } = await prisma.deadline.updateMany({ where: { id, userId: user.id }, data: { ...rest, ...(dueOn ? { dueOn: dateOnly(dueOn) } : {}) } });
  if (!count) throw new ApiError(404, "Plazo no encontrado");
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/deadlines/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.deadline.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Plazo no encontrado");
  return { ok: true };
});
