import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOwnEvent, sportTagSchema } from "@/lib/finance/service";
import { deleteTransactionWithReceipts } from "@/lib/finance/v17-service";
import { prisma } from "@/lib/prisma";

/** Borra el asiento completo (las líneas caen en cascada; el trigger ve suma 0) y sus justificantes. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteTransactionWithReceipts(user.id, id);
  return { ok: true };
});

/** Marcar o desmarcar como gasto deportivo (y su competición). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { sport, eventId } = await parseBody(req, sportTagSchema);
  await assertOwnEvent(user.id, eventId);
  const { count } = await prisma.financialTransaction.updateMany({ where: { id, userId: user.id }, data: { sport: Boolean(sport) || Boolean(eventId), eventId: eventId ?? null } });
  if (!count) throw new ApiError(404, "Transacción no encontrada");
  return { ok: true };
});
