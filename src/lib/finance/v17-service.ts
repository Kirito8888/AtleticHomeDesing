import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { EXT, readSealed, removeSealed, sniffFile, writeSealed } from "@/lib/files/sealed-files";
import { prisma } from "@/lib/prisma";

import { priceAlerts, type SeasonBudgetInput, type SeasonLine, seasonForecast } from "./v17-finance";

type Posted = { postings: Array<{ amountCents: number; account: { type: string } }> };
/** Importe del movimiento: lo que entra o sale de las cuentas de dinero. */
const moneyCents = (t: Posted) => Math.abs(t.postings.filter((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY").reduce((a, p) => a + p.amountCents, 0));
const postingsSel = { postings: { select: { amountCents: true, account: { select: { type: true } } } } } as const;

// 25 · Presupuesto de temporada
export async function seasonBudgetView(userId: string, season: number, today: string) {
  const from = new Date(Date.UTC(season, 0, 1));
  const to = new Date(Date.UTC(season, 11, 31));
  const [row, txs, upcoming] = await Promise.all([
    prisma.seasonBudget.findUnique({ where: { userId_season: { userId, season } } }),
    prisma.financialTransaction.findMany({ where: { userId, sport: true, kind: { in: ["INCOME", "EXPENSE"] }, date: { gte: from, lte: to } }, select: { kind: true, ...postingsSel } }),
    prisma.calendarEvent.count({ where: { userId, type: "COMPETITION", startAt: { gt: addDays(dateOnly(today), 0), lte: addDays(to, 1) } } }),
  ]);
  const lines = ((row?.lines ?? {}) as Partial<Record<SeasonLine, number>>) ?? {};
  const spentCents = txs.filter((t) => t.kind === "EXPENSE").reduce((a, t) => a + moneyCents(t), 0);
  const incomeCents = txs.filter((t) => t.kind === "INCOME").reduce((a, t) => a + moneyCents(t), 0);
  return { season, lines, perCompetitionCents: row?.perCompetitionCents ?? 0, incomeCents, upcomingCompetitions: upcoming, hasBudget: Boolean(row), ...seasonForecast({ lines, perCompetitionCents: row?.perCompetitionCents ?? 0, spentCents, incomeCents, upcomingCompetitions: upcoming, today, season }) };
}

export async function saveSeasonBudget(userId: string, b: SeasonBudgetInput) {
  return prisma.seasonBudget.upsert({
    where: { userId_season: { userId, season: b.season } },
    create: { userId, season: b.season, lines: b.lines, perCompetitionCents: b.perCompetitionCents },
    update: { lines: b.lines, perCompetitionCents: b.perCompetitionCents },
    select: { id: true },
  });
}

// 26 · Justificantes cifrados
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_PER_TX = 5;

export async function addReceipt(userId: string, transactionId: string, buf: Buffer) {
  const tx = await prisma.financialTransaction.findFirst({ where: { id: transactionId, userId }, select: { id: true, _count: { select: { receipts: true } } } });
  if (!tx) throw new ApiError(404, "Movimiento no encontrado");
  if (tx._count.receipts >= MAX_PER_TX) throw new ApiError(400, `Como mucho ${MAX_PER_TX} justificantes por movimiento`);
  if (buf.length > RECEIPT_MAX_BYTES) throw new ApiError(413, "El justificante ocupa demasiado (máx. 5 MB)");
  const mime = sniffFile(buf);
  if (!mime) throw new ApiError(415, "Solo PDF, JPEG, PNG o WebP");
  const r = await prisma.receipt.create({ data: { userId, transactionId, path: "", mime }, select: { id: true } });
  const rel = `receipts/${r.id}${EXT[mime]}.enc`;
  await writeSealed(userId, rel, buf);
  await prisma.receipt.update({ where: { id: r.id }, data: { path: rel } });
  return r;
}

export async function readReceipt(userId: string, id: string) {
  const r = await prisma.receipt.findFirst({ where: { id, userId } });
  if (!r) throw new ApiError(404, "Justificante no encontrado");
  return { mime: r.mime, bytes: await readSealed(userId, r.path) };
}

export async function deleteReceipt(userId: string, id: string) {
  const r = await prisma.receipt.findFirst({ where: { id, userId } });
  if (!r) throw new ApiError(404, "Justificante no encontrado");
  await prisma.receipt.delete({ where: { id } });
  await removeSealed(userId, [r.path]);
}

/** Borra un movimiento y los ficheros de sus justificantes. */
export async function deleteTransactionWithReceipts(userId: string, id: string) {
  const files = await prisma.receipt.findMany({ where: { transactionId: id, userId }, select: { path: true } });
  const { count } = await prisma.financialTransaction.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Transacción no encontrada");
  await removeSealed(userId, files.map((f) => f.path));
}

// 27 · Suscripciones: editar (registra el cambio de precio) y avisos de subida
export const subscriptionPatchSchema = z.object({ amountCents: z.number().int().positive().max(100_000_00), isActive: z.boolean(), nextChargeDate: isoDate }).partial();

export async function updateSubscription(userId: string, id: string, p: z.infer<typeof subscriptionPatchSchema>, today: string) {
  const s = await prisma.subscription.findFirst({ where: { id, userId }, select: { amountCents: true } });
  if (!s) throw new ApiError(404, "Suscripción no encontrada");
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { ...p, ...(p.nextChargeDate ? { nextChargeDate: dateOnly(p.nextChargeDate) } : {}) } });
    if (p.amountCents != null && p.amountCents !== s.amountCents)
      await tx.subscriptionPriceChange.create({ data: { subscriptionId: id, fromCents: s.amountCents, toCents: p.amountCents, on: dateOnly(today), source: "EDIT", seenAt: p.amountCents < s.amountCents ? new Date() : null } });
  });
}

export async function subscriptionAlerts(userId: string, today: string) {
  const [subs, txs, changes] = await Promise.all([
    prisma.subscription.findMany({ where: { userId }, select: { id: true, name: true, amountCents: true, isActive: true } }),
    prisma.financialTransaction.findMany({ where: { userId, kind: "EXPENSE", date: { gte: addDays(dateOnly(today), -60) } }, select: { id: true, subscriptionId: true, description: true, payee: true, date: true, ...postingsSel } }),
    prisma.subscriptionPriceChange.findMany({ where: { subscription: { userId }, seenAt: null }, include: { subscription: { select: { name: true } } }, orderBy: { on: "desc" } }),
  ]);
  return {
    charged: priceAlerts(subs, txs.map((t) => ({ id: t.id, subscriptionId: t.subscriptionId, description: t.description, payee: t.payee, date: toIsoDay(t.date), amountCents: moneyCents(t) })), today),
    edited: changes.filter((c) => c.toCents > c.fromCents).map((c) => ({ id: c.id, name: c.subscription.name, fromCents: c.fromCents, toCents: c.toCents, on: toIsoDay(c.on), pct: Math.round(((c.toCents - c.fromCents) / c.fromCents) * 1000) / 10 })),
  };
}

export async function markPriceChangeSeen(userId: string, id: string) {
  const { count } = await prisma.subscriptionPriceChange.updateMany({ where: { id, subscription: { userId } }, data: { seenAt: new Date() } });
  if (!count) throw new ApiError(404, "Aviso no encontrado");
}
