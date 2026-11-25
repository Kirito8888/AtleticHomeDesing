import "server-only";

import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/session";
import { enqueueEventReminders } from "@/lib/jobs/queue";
import { buildIcs } from "@/lib/planning/ics";
import { assertNotRestricted } from "@/lib/privacy/service";
import { prisma } from "@/lib/prisma";
import { inQuietHours } from "@/lib/push/quiet";
import { notifyOnce } from "@/lib/push/service";
import { readPrefs } from "@/lib/rules/prefs";

import { inSendHours, MAX_JOBS_PER_RUN, MAX_PER_USER_DAY, reminderDue, reminderKey, reminderKeyPrefix, reminderText, reminderWindow, SUMMARY_BEFORE_H, summaryKey, summaryText } from "./event-reminders";
import { attendanceSummary, type Rsvp } from "./events";
import { requireOrgRole } from "./service";

type Sender = Parameters<typeof notifyOnce>[3];
export type ReminderJob = { eventId: string; memberId: string };

/**
 * Candidatas: atletas ACTIVE sin respuesta, sin tratamiento limitado (art. 18), de eventos dentro de la ventana
 * y de más de 6 h de vida. Sin franja horaria aquí: la revalida el trabajador.
 */
export async function dueEventReminders(now = new Date()): Promise<ReminderJob[]> {
  const w = reminderWindow(now);
  const events = await prisma.orgEvent.findMany({
    where: { startsAt: { gte: w.from, lte: w.to } },
    select: {
      id: true,
      startsAt: true,
      createdAt: true,
      org: { select: { members: { where: { role: "ATHLETE", status: "ACTIVE", user: { processingRestrictedAt: null } }, select: { id: true } } } },
      responses: { select: { memberId: true } },
    },
  });
  const jobs: ReminderJob[] = [];
  for (const e of events) {
    if (!reminderDue(e, now)) continue;
    const answered = new Set(e.responses.map((r) => r.memberId));
    for (const m of e.org.members) if (!answered.has(m.id)) jobs.push({ eventId: e.id, memberId: m.id });
  }
  return jobs.slice(0, MAX_JOBS_PER_RUN);
}

/** Encola los recordatorios (pg-boss) si es hora de avisar. Devuelve cuántos trabajos encoló. */
export async function runEventRemindersJob(now = new Date(), enqueue: (jobs: ReminderJob[]) => Promise<void> = enqueueEventReminders): Promise<number> {
  if (!inSendHours(now)) return 0;
  const jobs = await dueEventReminders(now);
  if (jobs.length) await enqueue(jobs);
  return jobs.length;
}

/**
 * Trabajador: revalida TODO antes de gastar la clave (una vez por evento y miembro). Las horas de silencio no
 * consumen el aviso: la siguiente pasada lo reintenta mientras el evento siga en la ventana.
 */
export async function sendEventReminder(job: ReminderJob, now = new Date(), send?: Sender): Promise<boolean> {
  if (!inSendHours(now)) return false;
  const m = await prisma.orgMember.findUnique({
    where: { id: job.memberId },
    select: { id: true, userId: true, orgId: true, role: true, status: true, org: { select: { id: true, name: true } }, user: { select: { processingRestrictedAt: true, athleteProfile: { select: { prefs: true } } } } },
  });
  if (!m || m.role !== "ATHLETE" || m.status !== "ACTIVE" || m.user.processingRestrictedAt) return false;
  const ev = await prisma.orgEvent.findFirst({ where: { id: job.eventId, orgId: m.orgId }, select: { id: true, title: true, startsAt: true, createdAt: true, responses: { where: { memberId: m.id }, select: { id: true } } } });
  if (!ev || ev.responses.length || !reminderDue(ev, now)) return false;
  if (inQuietHours(now, readPrefs(m.user.athleteProfile?.prefs).quietHours)) return false;
  const since = new Date(now.getTime() - 24 * 3600e3);
  const today = await prisma.notificationLog.count({ where: { userId: m.userId, key: { startsWith: "event-rsvp:" }, sentAt: { gte: since } } });
  if (today >= MAX_PER_USER_DAY) return false;
  return notifyOnce(m.userId, reminderKey(ev.id, m.id), reminderText(m.org, ev), send);
}

/** Resumen para el staff cuando faltan ≤ 24 h: solo recuentos (los nombres se ven dentro de la app). */
export async function runEventSummaryJob(now = new Date(), send?: Sender): Promise<number> {
  if (!inSendHours(now)) return 0;
  const events = await prisma.orgEvent.findMany({
    where: { startsAt: { gt: now, lte: new Date(now.getTime() + SUMMARY_BEFORE_H * 3600e3) } },
    select: {
      id: true,
      title: true,
      org: { select: { id: true, name: true, members: { where: { status: "ACTIVE" }, select: { id: true, userId: true, role: true } } } },
      responses: { select: { memberId: true, answer: true } },
    },
  });
  let sent = 0;
  for (const e of events) {
    const athletes = e.org.members.filter((m) => m.role === "ATHLETE").map((m) => ({ id: m.id, name: "" }));
    const s = attendanceSummary(e.responses as Array<{ memberId: string; answer: Rsvp }>, athletes);
    const msg = summaryText(e.org, e, s);
    for (const staff of e.org.members.filter((m) => m.role !== "ATHLETE")) if (await notifyOnce(staff.userId, summaryKey(e.id, staff.userId), msg, send)) sent++;
  }
  return sent;
}

/** A cuántas personas se les avisó (solo staff del club). */
export async function remindedCount(eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of eventIds) out.set(id, await prisma.notificationLog.count({ where: { key: { startsWith: reminderKeyPrefix(id) } } }));
  return out;
}

/** .ics de un evento para un miembro del club: título, hora y lugar; sin importe ni datos de nadie. */
export async function eventIcs(user: CurrentUser, orgId: string, eventId: string): Promise<string> {
  await requireOrgRole(user.id, orgId, ["ADMIN", "COACH", "ATHLETE"]);
  await assertNotRestricted(user.id, "descargar este evento");
  const ev = await prisma.orgEvent.findFirst({ where: { id: eventId, orgId }, select: { id: true, title: true, startsAt: true, location: true, org: { select: { name: true } } } });
  if (!ev) throw new ApiError(404, "No encontrado");
  return buildIcs(ev.org.name, [{ uid: `c-${ev.id}`, title: `${ev.org.name} · ${ev.title}`, start: ev.startsAt, end: null, allDay: false, location: ev.location }]);
}
