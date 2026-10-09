import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { taskPatchSchema } from "@/lib/planning/schemas";
import { prisma } from "@/lib/prisma";

type Ctx = RouteContext<"/api/tasks/[id]">;

export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const data = await parsePatchBody(req, taskPatchSchema);
  const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
  if (!task) throw new ApiError(404, "Tarea no encontrada");
  return prisma.task.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate === undefined ? undefined : data.dueDate ? dateOnly(data.dueDate) : null,
      completedAt: data.status === undefined ? undefined : data.status === "DONE" ? new Date() : null,
    },
  });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.task.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Tarea no encontrada");
  return { ok: true };
});
