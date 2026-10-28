import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOwnEvent, sportTagSchema, updateTransaction, updateTransactionSchema } from "@/lib/finance/service";
import { trashTransaction } from "@/lib/account/trash";
import { prisma } from "@/lib/prisma";

/**
 * `DELETE /api/finance/transactions/[id]` · A la papelera (v1.8): el asiento se borra (líneas en cascada) y se guarda una copia 7 días para deshacer.
 *
 * - Salida: 200 `{ ok, trashId }`. Errores: 401 · 403 origen/condiciones · 404 no existe o no es suya.
 */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { id: trashId } = await trashTransaction(user.id, id);
  return { ok: true, trashId };
});

/**
 * `PATCH /api/finance/transactions/[id]` · Marcar o desmarcar como gasto deportivo (y su competición).
 *
 * - Entrada: JSON `sportTagSchema` (`sport`, `eventId?`); con `eventId` queda marcada como deportiva.
 * - Errores: 400 datos no válidos o competición ajena · 401 · 403 origen/condiciones · 404 transacción no suya (`updateMany` con `userId`).
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { sport, eventId } = await parseBody(req, sportTagSchema);
  await assertOwnEvent(user.id, eventId);
  const { count } = await prisma.financialTransaction.updateMany({ where: { id, userId: user.id }, data: { sport: Boolean(sport) || Boolean(eventId), eventId: eventId ?? null } });
  if (!count) throw new ApiError(404, "Transacción no encontrada");
  return { ok: true };
});

/**
 * `PUT /api/finance/transactions/[id]` · Editar importe, cuenta, fecha, categoría o tipo de un gasto/ingreso;
 * los saldos se recalculan en la misma operación (se suman al leer).
 *
 * - Entrada: JSON `updateTransactionSchema`. Salida: 200 el movimiento actualizado.
 * - Errores: 400 cuenta/categoría ajena o asiento descuadrado · 401 · 403 origen/condiciones · 404 no suyo ·
 *   409 transferencias, aperturas y asientos partidos no se editan aquí.
 */
export const PUT = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateTransaction(user.id, id, await parseBody(req, updateTransactionSchema));
});
