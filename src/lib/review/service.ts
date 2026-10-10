import "server-only";

import { addDays, dateOnly, startOfIsoWeek, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { ReviewInput, WeekSummary } from "@/lib/review/review";

export async function weekSummary(userId: string, weekStart: Date): Promise<WeekSummary> {
  const range = { gte: weekStart, lte: addDays(weekStart, 6) };
  const [s, r, st, sp] = await Promise.all([
    prisma.trainingSession.aggregate({ where: { userId, status: "COMPLETED", date: range }, _sum: { tss: true }, _count: true }),
    prisma.recoveryMetrics.aggregate({ where: { userId, date: range, sleepHours: { not: null } }, _avg: { sleepHours: true } }),
    prisma.studySession.aggregate({ where: { userId, date: range }, _sum: { minutes: true } }),
    prisma.posting.aggregate({ where: { account: { userId, type: "EXPENSE" }, transaction: { date: range } }, _sum: { amountCents: true } }),
  ]);
  return { sessions: s._count, tss: s._sum.tss ?? 0, sleepH: r._avg.sleepHours, studyMin: st._sum.minutes ?? 0, spentCents: sp._sum.amountCents ?? 0 };
}

/** La semana que toca revisar: la actual (se hace el domingo; el lunes aún vale la anterior). */
export function reviewWeek(now = today()): Date {
  const monday = startOfIsoWeek(now);
  return now.getTime() === monday.getTime() ? addDays(monday, -7) : monday;
}

export async function getReview(userId: string, weekStart = reviewWeek()) {
  const [summary, prev, saved] = await Promise.all([
    weekSummary(userId, weekStart),
    weekSummary(userId, addDays(weekStart, -7)),
    prisma.weeklyReview.findUnique({ where: { userId_weekStart: { userId, weekStart } } }),
  ]);
  return { weekStart, summary, prev, saved };
}

export async function saveReview(userId: string, input: ReviewInput) {
  const weekStart = startOfIsoWeek(dateOnly(input.weekStart));
  const summary = await weekSummary(userId, weekStart);
  const data = { summary, wentWell: input.wentWell || null, change: input.change || null, focus: input.focus || null };
  return prisma.weeklyReview.upsert({ where: { userId_weekStart: { userId, weekStart } }, create: { userId, weekStart, ...data }, update: data });
}

/** Foco elegido en la última revisión (vale para la semana siguiente). */
export async function currentFocus(userId: string, now = today()) {
  const r = await prisma.weeklyReview.findFirst({
    where: { userId, focus: { not: null }, weekStart: { gte: addDays(startOfIsoWeek(now), -7) } },
    orderBy: { weekStart: "desc" },
    select: { focus: true },
  });
  return r?.focus ?? null;
}
