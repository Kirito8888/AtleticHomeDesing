import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { type ImportedEvent, newCompetitions, seasonRecords, throwsByImplementWeek } from "./competition-tools";

/** 2 · Diario técnico: sesiones técnicas con clave, foco, notas y etiquetas; búsqueda por texto y etiqueta. */
export async function technicalDiary(userId: string, q: string | null, tag: string | null) {
  const text = q?.trim() ? q.trim() : null;
  const rows = await prisma.trainingSession.findMany({
    where: {
      userId,
      status: "COMPLETED",
      technical: { isNot: null },
      ...(tag ? { tags: { has: tag } } : {}),
      ...(text
        ? {
            OR: [
              { notes: { contains: text, mode: Prisma.QueryMode.insensitive } },
              { title: { contains: text, mode: Prisma.QueryMode.insensitive } },
              { technical: { is: { cue: { contains: text, mode: Prisma.QueryMode.insensitive } } } },
              { technical: { is: { focus: { contains: text, mode: Prisma.QueryMode.insensitive } } } },
            ],
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 100,
    select: { id: true, date: true, title: true, notes: true, tags: true, technical: { select: { event: true, implementWeightG: true, cue: true, focus: true, bestMarkM: true } } },
  });
  const allTags = await prisma.$queryRaw<Array<{ tag: string; n: number }>>`select unnest(tags) as tag, count(*)::int as n from "TrainingSession" where "userId" = ${userId} group by 1 order by 2 desc limit 30`;
  return { rows: rows.map((r) => ({ ...r, date: toIsoDay(r.date) })), tags: allTags };
}

/** 6 y 8 · Lanzamientos por implemento y semana (12 semanas) y récords por temporada y categoría. */
export async function throwStats(userId: string, today: string) {
  const [recent, all, profile] = await Promise.all([
    prisma.technicalSession.findMany({
      where: { session: { userId, status: "COMPLETED", date: { gte: addDays(dateOnly(today), -84) } } },
      select: { implementWeightG: true, session: { select: { date: true } }, _count: { select: { attempts: true } } },
    }),
    prisma.technicalAttempt.findMany({
      where: { isFoul: false, markM: { gt: 0 }, technicalSession: { session: { userId, status: "COMPLETED" } } },
      select: { markM: true, technicalSession: { select: { event: true, implementWeightG: true, isCompetition: true, session: { select: { date: true } } } } },
    }),
    prisma.athleteProfile.findUnique({ where: { userId }, select: { birthDate: true } }),
  ]);
  return {
    byWeek: throwsByImplementWeek(recent.map((r) => ({ date: toIsoDay(r.session.date), implementWeightG: r.implementWeightG, throws: r._count.attempts }))),
    records: seasonRecords(
      all.map((a) => ({ date: toIsoDay(a.technicalSession.session.date), event: a.technicalSession.event, implementWeightG: a.technicalSession.implementWeightG, markM: a.markM!, isCompetition: a.technicalSession.isCompetition })),
      profile?.birthDate ? toIsoDay(profile.birthDate) : null,
    ),
  };
}

/** 7 · Datos para comparar sesiones. */
export async function sessionForCompare(userId: string, id: string) {
  const s = await prisma.trainingSession.findFirst({
    where: { id, userId },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      sessionRpe: true,
      tss: true,
      technical: { select: { bestMarkM: true, attempts: { where: { isFoul: false }, select: { id: true } } } },
      strength: { select: { sets: { where: { isWarmup: false }, select: { reps: true, weightKg: true } } } },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    date: toIsoDay(s.date),
    title: s.title,
    type: s.type,
    durationSec: s.durationSec,
    sessionRpe: s.sessionRpe,
    tss: s.tss != null ? Math.round(s.tss) : null,
    bestMarkM: s.technical?.bestMarkM ?? null,
    validThrows: s.technical?.attempts.length ?? 0,
    strengthVolumeKg: Math.round(s.strength?.sets.reduce((a, x) => a + x.reps * x.weightKg, 0) ?? 0),
  };
}

export async function recentSessionsForPick(userId: string) {
  const rows = await prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED" }, orderBy: { date: "desc" }, take: 60, select: { id: true, date: true, title: true, type: true } });
  return rows.map((r) => ({ ...r, date: toIsoDay(r.date) }));
}

/** 3 · Guardar las competiciones importadas que no estén ya (mismo día y nombre). */
export async function importCompetitions(userId: string, events: ImportedEvent[], today: string) {
  const existing = await prisma.calendarEvent.findMany({ where: { userId, type: "COMPETITION" }, select: { title: true, startAt: true } });
  const fresh = newCompetitions(events, existing.map((e) => ({ title: e.title, date: toIsoDay(e.startAt) })), today);
  if (fresh.length) {
    await prisma.calendarEvent.createMany({ data: fresh.map((e) => ({ userId, type: "COMPETITION", title: e.title, startAt: dateOnly(e.date), allDay: true, location: e.location })) });
  }
  return { added: fresh.length, skipped: events.length - fresh.length };
}
