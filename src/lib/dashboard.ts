import "server-only";

import { addDays, today, toIsoDay } from "@/lib/dates";
import { budgetsStatus } from "@/lib/finance/service";
import { getDay } from "@/lib/nutrition/service";
import { prisma } from "@/lib/prisma";
import { activeInjuries } from "@/lib/recovery/injuries";
import { injuryAlert } from "@/lib/recovery/injury-rules";
import { getPerformanceSeries } from "@/lib/training/service";

/** Todo lo que necesita el panel de inicio, en paralelo. */
export async function getDashboard(userId: string) {
  const now = today();
  const day = toIsoDay(now);
  const [perf, recovery, sessions, nutrition, budgets, dueCards, tasks, nextCompetition, injuries] = await Promise.all([
    getPerformanceSeries(userId, 14),
    prisma.recoveryMetrics.findUnique({ where: { userId_date: { userId, date: now } } }),
    prisma.trainingSession.findMany({
      where: { userId, date: now },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, type: true, status: true, tss: true, durationSec: true },
    }),
    getDay(userId, day),
    budgetsStatus(userId, now),
    prisma.flashcard.count({ where: { deck: { userId }, dueAt: { lte: new Date() } } }),
    prisma.task.findMany({
      where: { userId, status: { in: ["TODO", "IN_PROGRESS"] }, OR: [{ dueDate: null }, { dueDate: { lte: addDays(now, 2) } }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 30,
    }),
    prisma.calendarEvent.findFirst({
      where: { userId, type: "COMPETITION", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    activeInjuries(userId),
  ]);
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  return {
    day,
    perf,
    recovery,
    sessions,
    nutrition,
    budgetAlerts: budgets.filter((b) => b.state !== "OK"),
    dueCards,
    tasks: tasks.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 5),
    nextCompetition,
    injuryAlert: injuryAlert(injuries, perf.current?.acwr ?? null),
  };
}
