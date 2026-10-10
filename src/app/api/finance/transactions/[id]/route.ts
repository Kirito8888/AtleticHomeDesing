import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOwnEvent, sportTagSchema } from "@/lib/finance/service";
import { trashTransaction } from "@/lib/account/trash";
import { prisma } from "@/lib/prisma";

/** A la papelera (v1.8): el asiento se borra (líneas en cascada) y se guarda una copia 7 días para deshacer. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { id: trashId } = await trashTransaction(user.id, id);
  return { ok: true, trashId };
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
