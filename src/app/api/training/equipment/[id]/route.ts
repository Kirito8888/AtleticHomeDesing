import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { equipmentPatchSchema } from "@/lib/training/equipment";

/** Anotar usos a mano, retirar o cambiar la vida útil. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/training/equipment/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { addUses, ...rest } = await parsePatchBody(req, equipmentPatchSchema);
  const { count } = await prisma.equipment.updateMany({
    where: { id, userId: user.id },
    data: { ...rest, ...(addUses ? { extraUses: { increment: addUses } } : {}) },
  });
  if (!count) throw new ApiError(404, "Material no encontrado");
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/training/equipment/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.equipment.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Material no encontrado");
  return { ok: true };
});
