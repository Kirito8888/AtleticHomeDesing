import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { equipmentAlerts, equipmentSchema, equipmentState } from "./equipment";
import type { z } from "zod";

/** Una competición sin intentos registrados cuenta como 6 lanzamientos (igual que el tope semanal). */
const COMPETITION_THROWS = 6;

/**
 * Usos desde la compra: lanzamientos con ese peso de implemento (jabalina),
 * sesiones de pista o técnica (clavos), todas las sesiones (zapatillas) + los anotados a mano.
 */
async function countUses(userId: string, item: { kind: string; implementWeightG: number | null; purchasedOn: Date | null; extraUses: number }) {
  const since = item.purchasedOn ? { gte: item.purchasedOn } : undefined;
  const base = { userId, status: "COMPLETED" as const, ...(since ? { date: since } : {}) };
  if (item.kind === "JAVELIN") {
    const rows = await prisma.technicalSession.findMany({
      where: { event: "JAVELIN", ...(item.implementWeightG ? { implementWeightG: item.implementWeightG } : {}), session: base },
      select: { isCompetition: true, _count: { select: { attempts: true } } },
    });
    return item.extraUses + rows.reduce((a, r) => a + (r._count.attempts || (r.isCompetition ? COMPETITION_THROWS : 0)), 0);
  }
  if (item.kind === "SPIKES") return item.extraUses + (await prisma.trainingSession.count({ where: { ...base, type: { in: ["TECHNICAL", "TRACK", "MIXED"] } } }));
  if (item.kind === "SHOES") return item.extraUses + (await prisma.trainingSession.count({ where: base }));
  return item.extraUses;
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
  return Promise.all(
    rows.map(async (r) => {
      const purchasedOn = r.purchasedOn ? toIsoDay(r.purchasedOn) : null;
      const uses = await countUses(userId, r);
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
