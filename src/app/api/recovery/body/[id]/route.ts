import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/recovery/body/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.bodyMeasure.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Medida no encontrada");
  return { ok: true };
});
