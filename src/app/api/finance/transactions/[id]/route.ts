import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Borra el asiento completo (las líneas caen en cascada; el trigger ve suma 0). */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.financialTransaction.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Transacción no encontrada");
  return { ok: true };
});
