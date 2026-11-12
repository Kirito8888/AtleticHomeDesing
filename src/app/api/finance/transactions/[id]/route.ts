import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertActiveAccounts, assertOwnEvent, sportTagSchema, updateTransaction, updateTransactionSchema } from "@/lib/finance/service";
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
 * - Errores: 400 datos no válidos o competición ajena · 401 · 403 origen/condiciones · 404 transacción no suya (`updateMany` con `userId`) ·
 *   409 el movimiento toca una cuenta archivada.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { sport, eventId } = await parseBody(req, sportTagSchema);
  await assertOwnEvent(user.id, eventId);
  const legs = await prisma.posting.findMany({ where: { transactionId: id, transaction: { userId: user.id } }, select: { accountId: true } });
  await assertActiveAccounts(user.id, legs.map((l) => l.accountId));
  const { count } = await prisma.financialTransaction.updateMany({ where: { id, userId: user.id }, data: { sport: Boolean(sport) || Boolean(eventId), eventId: eventId ?? null } });
  if (!count) throw new ApiError(404, "Transacción no encontrada");
  return { ok: true };
});

/**
 * `PUT /api/finance/transactions/[id]` · Editar un movimiento; los saldos se recalculan en la misma operación (se suman al leer).
 *
 * - Gasto/ingreso simple: `{ kind, date, description, amountCents, moneyAccountId, categoryId? }`.
 * - Transferencia o asiento partido: `{ mode: "lines", date, description, lines: [{ id, accountId, amountCents, categoryId?, memo? }] }`
 *   con **las mismas líneas** que ya tiene (ids), cambiando importes, cuentas, categorías o notas; debe cuadrar (Σ = 0).
 * - Errores: 400 cuenta/categoría ajena o asiento descuadrado · 401 · 403 origen/condiciones · 404 no suyo ·
 *   409 apertura de cuenta, añadir/quitar líneas, o alguna cuenta (antigua o nueva) archivada.
 */
export const PUT = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateTransaction(user.id, id, await parseBody(req, updateTransactionSchema));
});
