import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { removeSealed } from "@/lib/files/sealed-files";
import { prisma } from "@/lib/prisma";
import { createTrainingSession, deleteTrainingSession } from "@/lib/training/service";

import { SESSION_SNAPSHOT_INCLUDE, sessionInputFromSnapshot } from "./session-snapshot";

/**
 * v1.8 · Papelera de 7 días para sesiones, comidas y movimientos. Al borrar se guarda una copia
 * (JSON) y la fila se borra de verdad; «Deshacer» la vuelve a crear con el mismo id (las sesiones
 * recalculan TSS, marcas y carga). Los justificantes cifrados se quedan en disco hasta vaciar.
 */
export const TRASH_DAYS = 7;
type Kind = "SESSION" | "MEAL" | "TRANSACTION";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export async function trashSession(userId: string, id: string) {
  const s = await prisma.trainingSession.findFirst({ where: { id, userId }, include: SESSION_SNAPSHOT_INCLUDE });
  if (!s) throw new ApiError(404, "Sesión no encontrada");
  const item = await prisma.trashItem.create({ data: { userId, kind: "SESSION", label: `${s.title ?? "Sesión"} · ${fmt(s.date)}`, data: json(s) }, select: { id: true } });
  await deleteTrainingSession(userId, id);
  return item;
}

export async function trashMeal(userId: string, id: string) {
  const m = await prisma.macros.findFirst({ where: { id, userId }, include: { foodProduct: { select: { name: true } } } });
  if (!m) throw new ApiError(404, "Entrada no encontrada");
  const { foodProduct, ...row } = m;
  const item = await prisma.trashItem.create({ data: { userId, kind: "MEAL", label: `${foodProduct?.name ?? m.customName ?? "Comida"} · ${fmt(m.date)}`, data: json(row) }, select: { id: true } });
  await prisma.macros.delete({ where: { id } });
  return item;
}

export async function trashTransaction(userId: string, id: string) {
  const t = await prisma.financialTransaction.findFirst({ where: { id, userId }, include: { postings: true, receipts: true } });
  if (!t) throw new ApiError(404, "Transacción no encontrada");
  const item = await prisma.trashItem.create({
    data: { userId, kind: "TRANSACTION", label: `${t.description} · ${fmt(t.date)}`, data: json(t), files: t.receipts.map((r) => r.path) },
    select: { id: true },
  });
  // Los justificantes (filas) caen en cascada; sus ficheros se quedan hasta vaciar la papelera
  await prisma.financialTransaction.delete({ where: { id } });
  return item;
}

type Row = Record<string, unknown>;

async function restoreSession(userId: string, s: Row) {
  if (await prisma.trainingSession.findUnique({ where: { id: String(s.id) }, select: { id: true } })) throw new ApiError(409, "Esa sesión ya existe");
  const ids = new Set((await prisma.exercise.findMany({ where: { OR: [{ userId: null }, { userId }] }, select: { id: true } })).map((e) => e.id));
  const cycleOk = s.cycleId ? await prisma.trainingCycle.findFirst({ where: { id: String(s.cycleId), userId }, select: { id: true } }) : null;
  const { parsed } = sessionInputFromSnapshot({ ...s, cycleId: cycleOk ? s.cycleId : null }, (x) => (ids.has(String(x.exerciseId)) ? String(x.exerciseId) : null), true);
  if (!parsed.success) throw new ApiError(422, "No se pudo recuperar la sesión");
  await createTrainingSession(userId, (s.plannedById as string | null) ?? null, parsed.data, { id: String(s.id) });
}

async function restoreMeal(userId: string, m: Row) {
  const product = m.foodProductId ? await prisma.foodProduct.findUnique({ where: { id: String(m.foodProductId) }, select: { id: true } }) : null;
  await prisma.macros.create({ data: { ...(m as Prisma.MacrosUncheckedCreateInput), userId, foodProductId: product ? String(m.foodProductId) : null } });
}

async function restoreTransaction(userId: string, t: Row) {
  const { postings, receipts, ...row } = t as Row & { postings: Row[]; receipts: Row[] };
  const accounts = await prisma.financialAccount.count({ where: { userId, id: { in: postings.map((p) => String(p.accountId)) } } });
  if (accounts !== new Set(postings.map((p) => p.accountId)).size) throw new ApiError(409, "Alguna cuenta de este movimiento ya no existe");
  const sub = row.subscriptionId ? await prisma.subscription.findFirst({ where: { id: String(row.subscriptionId), userId }, select: { id: true } }) : null;
  await prisma.financialTransaction.create({
    data: {
      ...(row as Prisma.FinancialTransactionUncheckedCreateInput),
      userId,
      subscriptionId: sub ? String(row.subscriptionId) : null,
      postings: { create: postings.map(({ transactionId: _t, ...p }) => (void _t, p as Prisma.PostingUncheckedCreateWithoutTransactionInput)) },
      receipts: { create: receipts.map(({ transactionId: _t, userId: _u, ...r }) => (void _t, void _u, { ...(r as Prisma.ReceiptUncheckedCreateWithoutTransactionInput), userId })) },
    },
  });
}

export async function restoreTrash(userId: string, id: string) {
  const item = await prisma.trashItem.findFirst({ where: { id, userId } });
  if (!item) throw new ApiError(404, "No está en la papelera");
  const data = item.data as Row;
  if (item.kind === "SESSION") await restoreSession(userId, data);
  else if (item.kind === "MEAL") await restoreMeal(userId, data);
  else await restoreTransaction(userId, data);
  await prisma.trashItem.delete({ where: { id } });
  return { kind: item.kind as Kind, label: item.label };
}

export async function listTrash(userId: string, now = new Date()) {
  const items = await prisma.trashItem.findMany({ where: { userId }, orderBy: { deletedAt: "desc" }, select: { id: true, kind: true, label: true, deletedAt: true } });
  return items.map((i) => ({ ...i, daysLeft: Math.max(1, Math.ceil((i.deletedAt.getTime() + TRASH_DAYS * 864e5 - now.getTime()) / 864e5)) }));
}

/** Vacía lo que lleva más de 7 días (y borra los ficheros que guardaba). Lo llama el job diario. */
export async function purgeTrash(now = new Date()) {
  const old = await prisma.trashItem.findMany({ where: { deletedAt: { lt: new Date(now.getTime() - TRASH_DAYS * 864e5) } }, select: { id: true, userId: true, files: true } });
  for (const t of old) {
    await removeSealed(t.userId, t.files);
    await prisma.trashItem.delete({ where: { id: t.id } });
  }
  return old.length;
}
