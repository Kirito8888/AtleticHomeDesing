import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { equipmentAlerts, equipmentSchema, equipmentState } from "./equipment";
import type { z } from "zod";

/** Una competición sin intentos registrados cuenta como 6 lanzamientos (igual que el tope semanal). */
const COMPETITION_THROWS = 6;

type UsageItem = { kind: string; implementWeightG: number | null; purchasedOn: Date | null; extraUses: number };
type UsageData = {
  sessions: Array<{ date: Date; type: string }>;
  throws: Array<{ date: Date; weightG: number | null; count: number }>;
};

/**
 * Usos desde la compra: lanzamientos con ese peso de implemento (jabalina),
 * sesiones de pista o técnica (clavos), todas las sesiones (zapatillas) + los anotados a mano.
 * Se calcula en memoria sobre `UsageData` (una lectura para todo el material, no una por artículo).
 */
function countUses(data: UsageData, item: UsageItem) {
  const since = item.purchasedOn;
  const inRange = (d: Date) => !since || d >= since;
  if (item.kind === "JAVELIN") {
    return item.extraUses + data.throws.filter((r) => inRange(r.date) && (!item.implementWeightG || r.weightG === item.implementWeightG)).reduce((a, r) => a + r.count, 0);
  }
  if (item.kind === "SPIKES") return item.extraUses + data.sessions.filter((s) => inRange(s.date) && ["TECHNICAL", "TRACK", "MIXED"].includes(s.type)).length;
  if (item.kind === "SHOES") return item.extraUses + data.sessions.filter((s) => inRange(s.date)).length;
  return item.extraUses;
}

async function loadUsage(userId: string, items: UsageItem[]): Promise<UsageData> {
  const kinds = new Set(items.map((i) => i.kind));
  // Desde la compra más antigua; si algún artículo no tiene fecha, desde el principio.
  const dates = items.filter((i) => i.kind === "JAVELIN" || i.kind === "SPIKES" || i.kind === "SHOES").map((i) => i.purchasedOn);
  const since = dates.length && dates.every((d): d is Date => !!d) ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined;
  const base = { userId, status: "COMPLETED" as const, ...(since ? { date: { gte: since } } : {}) };
  const [sessions, javelin] = await Promise.all([
    kinds.has("SPIKES") || kinds.has("SHOES") ? prisma.trainingSession.findMany({ where: base, select: { date: true, type: true } }) : [],
    kinds.has("JAVELIN")
      ? prisma.technicalSession.findMany({
          where: { event: "JAVELIN", session: base },
          select: { isCompetition: true, implementWeightG: true, session: { select: { date: true } }, _count: { select: { attempts: true } } },
        })
      : [],
  ]);
  return {
    sessions: sessions.map((s) => ({ date: s.date, type: s.type })),
    throws: javelin.map((r) => ({ date: r.session.date, weightG: r.implementWeightG, count: r._count.attempts || (r.isCompetition ? COMPETITION_THROWS : 0) })),
  };
}

export async function listEquipment(userId: string, today: string) {
  const rows = await prisma.equipment.findMany({ where: { userId }, orderBy: [{ retired: "asc" }, { createdAt: "desc" }] });
  const txIds = rows.flatMap((r) => (r.transactionId ? [r.transactionId] : []));
  const txs = txIds.length
    ? await prisma.financialTransaction.findMany({
        where: { userId, id: { in: txIds } },
        select: { id: true, description: true, postings: { select: { amountCents: true, account: { select: { type: true } } } } },
      })
    : [];
  const price = new Map(
    txs.map((t) => [t.id, { description: t.description, cents: Math.abs(t.postings.filter((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY").reduce((a, p) => a + p.amountCents, 0)) }]),
  );
  const usage = await loadUsage(userId, rows);
  return Promise.all(
    rows.map(async (r) => {
      const purchasedOn = r.purchasedOn ? toIsoDay(r.purchasedOn) : null;
      const uses = countUses(usage, r);
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        implementWeightG: r.implementWeightG,
        purchasedOn,
        lifeUses: r.lifeUses,
        lifeMonths: r.lifeMonths,
        retired: r.retired,
        notes: r.notes,
        purchase: r.transactionId ? (price.get(r.transactionId) ?? null) : null,
        state: equipmentState({ purchasedOn, lifeUses: r.lifeUses, lifeMonths: r.lifeMonths }, uses, today),
      };
    }),
  );
}

export async function equipmentAlertsToday(userId: string, today: string) {
  if (!(await prisma.equipment.count({ where: { userId, retired: false } }))) return [];
  return equipmentAlerts(await listEquipment(userId, today));
}

export async function createEquipment(userId: string, input: z.infer<typeof equipmentSchema>) {
  if (input.transactionId) {
    const own = await prisma.financialTransaction.count({ where: { id: input.transactionId, userId } });
    if (!own) throw new ApiError(400, "Ese gasto no existe");
  }
  return prisma.equipment.create({
    data: {
      userId,
      name: input.name,
      kind: input.kind,
      implementWeightG: input.kind === "JAVELIN" ? (input.implementWeightG ?? null) : null,
      purchasedOn: input.purchasedOn ? dateOnly(input.purchasedOn) : null,
      lifeUses: input.lifeUses ?? null,
      lifeMonths: input.lifeMonths ?? null,
      transactionId: input.transactionId ?? null,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
}
