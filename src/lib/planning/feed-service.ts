import "server-only";

import { addDays, today, toIsoDay } from "@/lib/dates";
import { SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";
import { studyIcsEvents } from "@/lib/study/exam-plan";
import { listSlots } from "@/lib/study/schedule-service";

import { buildIcs, type IcsEvent } from "./ics";

/**
 * Calendario .ics de solo lectura (sesiones planificadas y eventos) para
 * Google/Apple Calendar. Un solo enlace activo por usuario; se puede revocar.
 * Solo títulos, fechas y lugar: ni notas, ni marcas, ni datos de salud.
 */
export async function createFeed(userId: string): Promise<string> {
  const { token, hash } = newShareToken();
  await prisma.$transaction([prisma.calendarFeed.deleteMany({ where: { userId } }), prisma.calendarFeed.create({ data: { userId, tokenHash: hash } })]);
  return token;
}

export async function revokeFeeds(userId: string) {
  await prisma.calendarFeed.deleteMany({ where: { userId } });
}

export async function feedStatus(userId: string) {
  const f = await prisma.calendarFeed.findFirst({ where: { userId }, select: { createdAt: true, lastUsedAt: true } });
  return f ? { active: true, createdAt: f.createdAt.toISOString(), lastUsedAt: f.lastUsedAt?.toISOString() ?? null } : { active: false, createdAt: null, lastUsedAt: null };
}

/** «(versión suave)» puede delatar el motivo (síntomas): fuera del feed. */
const cleanTitle = (t: string) => t.replace(/\s*\(versión suave\)\s*/gi, " ").trim();

/** .ics del dueño del token, o null si no existe (o fue revocado). */
export async function feedIcs(token: string): Promise<string | null> {
  if (!isShareToken(token)) return null;
  const feed = await prisma.calendarFeed.findUnique({ where: { tokenHash: hashShareToken(token) }, select: { id: true, userId: true } });
  if (!feed) return null;
  const now = today();
  const [sessions, events] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: feed.userId, date: { gte: addDays(now, -30), lte: addDays(now, 180) } },
      select: { id: true, date: true, title: true, type: true, status: true },
      orderBy: { date: "asc" },
      take: 1000,
    }),
    prisma.calendarEvent.findMany({
      where: { userId: feed.userId, startAt: { gte: addDays(now, -60), lte: addDays(now, 400) } },
      select: { id: true, title: true, startAt: true, endAt: true, allDay: true, location: true },
    }),
  ]);
  await prisma.calendarFeed.update({ where: { id: feed.id }, data: { lastUsedAt: new Date() } });
  // v1.6 · clases y exámenes solo si lo activas en Ajustes (y solo la asignatura)
  const study = (await getPrefs(feed.userId)).icsStudy ? studyIcsEvents(await listSlots(feed.userId), toIsoDay(now), 120) : [];
  const list: IcsEvent[] = [
    ...sessions
      .filter((s) => s.status !== "SKIPPED")
      .map((s) => ({ uid: `s-${s.id}`, title: cleanTitle(s.title ?? SESSION_TYPE_LABEL[s.type] ?? "Entreno"), start: s.date, allDay: true })),
    ...events.map((e) => ({ uid: `e-${e.id}`, title: e.title, start: e.startAt, end: e.endAt, allDay: e.allDay, location: e.location })),
    ...study,
  ];
  return buildIcs("LifeOS · Entrenos y competiciones", list);
}
