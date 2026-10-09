import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { gradeSchema } from "@/lib/study/exam-plan";

export const PATCH = route(async (req, ctx: RouteContext<"/api/study/grades/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const g = await parsePatchBody(req, gradeSchema.partial());
  const { count } = await prisma.grade.updateMany({ where: { id, userId: user.id }, data: { ...g, ...("term" in g ? { term: g.term || null } : {}), ...("grade" in g ? { grade: g.grade ?? null } : {}) } });
  if (!count) throw new ApiError(404, "Nota no encontrada");
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/grades/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.grade.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Nota no encontrada");
  return { ok: true };
});
