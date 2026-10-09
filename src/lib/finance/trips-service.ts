import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { assertOwnEvent } from "./service";
import { deadlineState, tripStatus } from "./trips";

type TripInput = { name: string; eventId?: string | null; startsOn: string; endsOn?: string | null; budget: Record<string, number>; reimbursableCents: number };

/** Importe de un gasto: lo que sale de la cuenta de dinero (igual que en el informe deportivo). */
const moneyOut = (postings: Array<{ amountCents: number; account: { type: string } }>) =>
  Math.abs(postings.filter((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY").reduce((a, p) => a + p.amountCents, 0));

export async function listTrips(userId: string) {
  const [trips, txs] = await Promise.all([
    prisma.trip.findMany({ where: { userId }, orderBy: { startsOn: "desc" } }),
    prisma.financialTransaction.findMany({
      where: { userId, tripId: { not: null } },
      select: { id: true, tripId: true, date: true, description: true, kind: true, postings: { select: { amountCents: true, account: { select: { type: true } } } } },
      orderBy: { date: "asc" },
    }),
  ]);
  const eventIds = trips.flatMap((t) => (t.eventId ? [t.eventId] : []));
  const events = eventIds.length ? await prisma.calendarEvent.findMany({ where: { userId, id: { in: eventIds } }, select: { id: true, title: true } }) : [];
  return trips.map((t) => {
    const mine = txs.filter((x) => x.tripId === t.id && x.kind === "EXPENSE").map((x) => ({ id: x.id, date: toIsoDay(x.date), description: x.description, amountCents: moneyOut(x.postings) }));
    return {
      id: t.id,
      name: t.name,
      eventId: t.eventId,
      eventTitle: events.find((e) => e.id === t.eventId)?.title ?? null,
      startsOn: toIsoDay(t.startsOn),
      endsOn: t.endsOn ? toIsoDay(t.endsOn) : null,
      reimbursableCents: t.reimbursableCents,
      reimbursedAt: t.reimbursedAt?.toISOString() ?? null,
      expenses: mine,
      ...tripStatus(t, mine.reduce((a, x) => a + x.amountCents, 0)),
    };
  });
}

export async function createTrip(userId: string, t: TripInput) {
  await assertOwnEvent(userId, t.eventId);
  return prisma.trip.create({
    data: { userId, name: t.name, eventId: t.eventId ?? null, startsOn: dateOnly(t.startsOn), endsOn: t.endsOn ? dateOnly(t.endsOn) : null, budget: t.budget as Prisma.InputJsonValue, reimbursableCents: t.reimbursableCents },
    select: { id: true },
  });
}

async function ownTrip(userId: string, id: string) {
  const t = await prisma.trip.findFirst({ where: { id, userId }, select: { id: true, eventId: true } });
  if (!t) throw new ApiError(404, "Viaje no encontrado");
  return t;
}

/** Cambios: reembolsado sí/no, enlazar o soltar un gasto (queda como deportivo y con la competición del viaje). */
export async function updateTrip(userId: string, id: string, p: { reimbursed?: boolean; reimbursableCents?: number; link?: string; unlink?: string }) {
  const t = await ownTrip(userId, id);
  const data: Prisma.TripUpdateInput = {};
  if (p.reimbursed !== undefined) data.reimbursedAt = p.reimbursed ? new Date() : null;
  if (p.reimbursableCents !== undefined) data.reimbursableCents = p.reimbursableCents;
  if (Object.keys(data).length) await prisma.trip.update({ where: { id }, data });
  if (p.link) {
    const { count } = await prisma.financialTransaction.updateMany({ where: { id: p.link, userId, kind: "EXPENSE" }, data: { tripId: id, sport: true, ...(t.eventId ? { eventId: t.eventId } : {}) } });
    if (!count) throw new ApiError(404, "Gasto no encontrado");
  }
  if (p.unlink) await prisma.financialTransaction.updateMany({ where: { id: p.unlink, userId, tripId: id }, data: { tripId: null } });
}

export async function deleteTrip(userId: string, id: string) {
  await ownTrip(userId, id);
  await prisma.$transaction([prisma.financialTransaction.updateMany({ where: { userId, tripId: id }, data: { tripId: null } }), prisma.trip.delete({ where: { id } })]);
}

/** Gastos recientes sin viaje (para enlazarlos). */
export async function unlinkedExpenses(userId: string, take = 30) {
  const txs = await prisma.financialTransaction.findMany({
    where: { userId, kind: "EXPENSE", tripId: null },
    orderBy: { date: "desc" },
    take,
    select: { id: true, date: true, description: true, postings: { select: { amountCents: true, account: { select: { type: true } } } } },
  });
  return txs.map((x) => ({ id: x.id, date: toIsoDay(x.date), description: x.description, amountCents: moneyOut(x.postings) }));
}

export async function listDeadlines(userId: string, today: string) {
  const rows = await prisma.deadline.findMany({ where: { userId }, orderBy: [{ done: "asc" }, { dueOn: "asc" }] });
  return rows.map((d) => {
    const x = { id: d.id, title: d.title, kind: d.kind, dueOn: toIsoDay(d.dueOn), remindDays: d.remindDays, done: d.done };
    return { ...x, ...deadlineState(x, today) };
  });
}
