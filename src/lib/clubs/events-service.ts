import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/session";
import { addDays, localDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { attendanceSummary, type EventCreate, madridWallToInstant, type Rsvp } from "./events";
import { parseAmount } from "./fees";
import { remindedCount } from "./event-reminders-service";
import { requireOrgRole } from "./service";

const isPast = (startsAt: Date, now = new Date()) => localDay(startsAt) < localDay(now);

/** Cualquier miembro ACTIVE del club; si no, 404 (no se revela si el club existe). */
const requireMember = (userId: string, orgId: string) => requireOrgRole(userId, orgId, ["ADMIN", "COACH", "ATHLETE"]);

/**
 * Eventos de los últimos 7 días y próximos. Una atleta ve SOLO su respuesta y su cuota (ni nombres ni recuentos de
 * las demás: Puerta 0.5, menores). El staff (ADMIN/COACH) ve el resumen con nombres.
 */
export async function listEvents(user: CurrentUser, orgId: string) {
  const me = await requireMember(user.id, orgId);
  const staff = me.role !== "ATHLETE";
  const events = await prisma.orgEvent.findMany({
    where: { orgId, startsAt: { gte: addDays(today(), -7) } },
    orderBy: { startsAt: "asc" },
    include: {
      responses: staff ? true : { where: { memberId: me.id } },
      fees: { where: { memberId: me.id }, select: { id: true, status: true, paidAt: true, amountCents: true } },
    },
  });
  const members = staff
    ? await prisma.orgMember.findMany({ where: { orgId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } })
    : [];
  const roster = members.map((m) => ({ id: m.id, name: m.user.name ?? m.user.email }));
  const reminded = staff ? await remindedCount(events.map((e) => e.id)) : null;
  const now = new Date();
  return {
    role: me.role,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      location: e.location,
      feeCents: e.feeCents,
      past: isPast(e.startsAt, now),
      myAnswer: (e.responses.find((r) => r.memberId === me.id)?.answer ?? null) as Rsvp | null,
      myFee: e.fees[0] ? { id: e.fees[0].id, status: e.fees[0].status, paidAt: e.fees[0].paidAt?.toISOString().slice(0, 10) ?? null } : null,
      reminded: reminded?.get(e.id) ?? null,
      summary: staff ? attendanceSummary(e.responses, roster) : null,
    })),
  };
}

export async function createEvent(user: CurrentUser, orgId: string, input: EventCreate) {
  const me = await requireOrgRole(user.id, orgId, ["ADMIN", "COACH"]);
  const feeCents = input.amount ? parseAmount(input.amount) : null;
  if (feeCents && me.role !== "ADMIN") throw new ApiError(403, "Solo la administración del club pone una cuota");
  const startsAt = madridWallToInstant(input.startsAt);
  if (!startsAt) throw new ApiError(422, "Fecha y hora no válidas");
  return prisma.orgEvent.create({ data: { orgId, title: input.title, startsAt, location: input.location || null, feeCents, createdById: user.id } });
}

export async function updateEvent(user: CurrentUser, orgId: string, eventId: string, input: { title?: string; startsAt?: string; location?: string | null }) {
  await requireOrgRole(user.id, orgId, ["ADMIN", "COACH"]);
  const ev = await prisma.orgEvent.findFirst({ where: { id: eventId, orgId } });
  if (!ev) throw new ApiError(404, "No encontrado");
  const startsAt = input.startsAt ? madridWallToInstant(input.startsAt) : undefined;
  if (input.startsAt && !startsAt) throw new ApiError(422, "Fecha y hora no válidas");
  return prisma.orgEvent.update({ where: { id: ev.id }, data: { title: input.title, startsAt: startsAt ?? undefined, location: input.location } });
}

/** Borra el evento y sus respuestas; las cuotas aún PENDIENTES nacidas de él se anulan, las pagadas se conservan. */
export async function deleteEvent(user: CurrentUser, orgId: string, eventId: string) {
  await requireOrgRole(user.id, orgId, ["ADMIN", "COACH"]);
  const ev = await prisma.orgEvent.findFirst({ where: { id: eventId, orgId } });
  if (!ev) throw new ApiError(404, "No encontrado");
  await prisma.$transaction([prisma.orgFee.deleteMany({ where: { eventId: ev.id, status: "PENDING" } }), prisma.orgEvent.delete({ where: { id: ev.id } })]);
}

/**
 * Responde (o cambia la respuesta) en 1 toque. Con importe, «Sí» de una atleta apunta una cuota PENDIENTE (sin cobro);
 * pasar a «No/Quizá» la quita solo si sigue pendiente (una pagada la resuelve la administración).
 */
export async function respond(user: CurrentUser, orgId: string, eventId: string, answer: Rsvp) {
  const me = await requireMember(user.id, orgId);
  const ev = await prisma.orgEvent.findFirst({ where: { id: eventId, orgId } });
  if (!ev) throw new ApiError(404, "No encontrado");
  if (isPast(ev.startsAt)) throw new ApiError(409, "El evento ya pasó");
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Dos toques a la vez no deben duplicar la cuota
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rsvp:${eventId}:${me.id}`}))`;
    await tx.orgEventResponse.upsert({
      where: { eventId_memberId: { eventId, memberId: me.id } },
      create: { eventId, memberId: me.id, answer },
      update: { answer },
    });
    if (!ev.feeCents || me.role !== "ATHLETE") return;
    const fee = await tx.orgFee.findFirst({ where: { eventId, memberId: me.id } });
    if (answer === "YES" && !fee) {
      await tx.orgFee.create({ data: { orgId, memberId: me.id, eventId, concept: ev.title.slice(0, 80), amountCents: ev.feeCents, dueDate: new Date(`${localDay(ev.startsAt)}T00:00:00Z`) } });
    } else if (answer !== "YES" && fee?.status === "PENDING") {
      await tx.orgFee.delete({ where: { id: fee.id } });
    }
  });
  return { answer };
}

/** Eventos futuros sin responder por club (para el aviso de /clubs). Solo los míos. */
export async function unansweredByClub(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.orgEvent.findMany({
    where: { startsAt: { gte: addDays(today(), -1) }, org: { members: { some: { userId, status: "ACTIVE" } } }, responses: { none: { member: { userId } } } },
    select: { orgId: true, startsAt: true },
  });
  const out = new Map<string, number>();
  const now = new Date();
  for (const r of rows) if (!isPast(r.startsAt, now)) out.set(r.orgId, (out.get(r.orgId) ?? 0) + 1);
  return out;
}
