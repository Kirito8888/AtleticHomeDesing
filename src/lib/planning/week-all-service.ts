import "server-only";

import { addDays, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_LABEL } from "@/lib/recovery/health-admin";
import { classesInWeek, type WeekItem } from "@/lib/planning/week-all";
import { SESSION_TYPE_LABEL } from "@/lib/format";

const madridMin = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number);
  return h * 60 + m;
};
const madridDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/** v1.8 · Todo lo de una semana en una sola lista (solo lectura). Las citas sin notas: son de salud. */
export async function weekAll(userId: string, weekStart: Date): Promise<WeekItem[]> {
  const end = addDays(weekStart, 6);
  const range = { gte: weekStart, lte: end };
  const endTs = addDays(weekStart, 7);
  const [sessions, slots, exams, blocks, assignments, appts, events] = await Promise.all([
    prisma.trainingSession.findMany({ where: { userId, date: range }, select: { id: true, date: true, type: true, title: true, status: true, startedAt: true } }),
    prisma.classSlot.findMany({ where: { userId, kind: "CLASS" }, select: { subject: true, weekday: true, startMin: true, validFrom: true, validTo: true, location: true } }),
    prisma.classSlot.findMany({ where: { userId, kind: "EXAM", date: range }, select: { subject: true, date: true, startMin: true, location: true } }),
    prisma.studyPlanBlock.findMany({ where: { userId, date: range }, select: { subject: true, date: true, minutes: true, done: true } }),
    prisma.assignment.findMany({ where: { userId, dueOn: range }, select: { subject: true, title: true, dueOn: true, status: true } }),
    prisma.appointment.findMany({ where: { userId, at: { gte: weekStart, lt: endTs } }, select: { kind: true, at: true, place: true } }),
    prisma.calendarEvent.findMany({ where: { userId, startAt: { gte: weekStart, lt: endTs }, type: { in: ["COMPETITION", "TIME_TRIAL", "TEST_1RM", "OTHER"] } }, select: { id: true, type: true, title: true, startAt: true, allDay: true } }),
  ]);
  const ws = toIsoDay(weekStart);
  return [
    ...sessions.map((s) => ({
      date: toIsoDay(s.date),
      min: s.startedAt ? madridMin(s.startedAt) : null,
      kind: "training" as const,
      title: s.title ?? SESSION_TYPE_LABEL[s.type],
      href: `/training/${s.id}`,
      done: s.status === "COMPLETED",
    })),
    ...classesInWeek(
      slots.map((s) => ({ ...s, validFrom: s.validFrom ? toIsoDay(s.validFrom) : null, validTo: s.validTo ? toIsoDay(s.validTo) : null })),
      ws,
    ).map((c) => ({ ...c, href: "/study/schedule" })),
    ...exams.map((e) => ({ date: toIsoDay(e.date!), min: e.startMin, kind: "exam" as const, title: `${e.subject}${e.location ? ` · ${e.location}` : ""}`, href: "/study/exams" })),
    ...blocks.map((b) => ({ date: toIsoDay(b.date), min: null, kind: "study" as const, title: `${b.subject} · ${b.minutes} min`, href: "/study/plan", done: b.done })),
    ...assignments.map((a) => ({ date: toIsoDay(a.dueOn), min: null, kind: "assignment" as const, title: `${a.title} (${a.subject})`, href: "/study/assignments", done: a.status === "DONE" })),
    ...appts.map((a) => ({ date: madridDay(a.at), min: madridMin(a.at), kind: "appointment" as const, title: `${APPOINTMENT_LABEL[a.kind as keyof typeof APPOINTMENT_LABEL] ?? "Cita"}${a.place ? ` · ${a.place}` : ""}`, href: "/recovery/health" })),
    ...events.map((e) => ({
      date: madridDay(e.startAt),
      min: e.allDay ? null : madridMin(e.startAt),
      kind: e.type === "COMPETITION" ? ("competition" as const) : ("event" as const),
      title: e.title,
      href: e.type === "COMPETITION" ? `/planning/competition/${e.id}` : "/planning",
    })),
  ];
}
