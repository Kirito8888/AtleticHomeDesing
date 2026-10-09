import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { budgetsStatus } from "@/lib/finance/service";
import { cycleToday } from "@/lib/health/cycle-service";
import { getDay } from "@/lib/nutrition/service";
import { prisma } from "@/lib/prisma";
import { activeInjuries } from "@/lib/recovery/injuries";
import { injuryAlert } from "@/lib/recovery/injury-rules";
import { womenAlertsToday } from "@/lib/health/women-service";
import { rulesToday } from "@/lib/rules/rules-service";
import { habitsToday, upcomingExamClashes } from "@/lib/study/schedule-service";
import { getPerformanceSeries } from "@/lib/training/service";

/** Todo lo que necesita el panel de inicio, en paralelo. */
export async function getDashboard(userId: string) {
  const now = today();
  const day = toIsoDay(now);
  const [perf, recovery, sessions, nutrition, budgets, dueCards, tasks, nextCompetition, injuries, allRuleAlerts, tomorrow, women, habits, study] = await Promise.all([
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
    rulesToday(userId, day),
    prisma.trainingSession.findMany({ where: { userId, date: addDays(now, 1), status: "PLANNED" }, select: { id: true } }),
    womenAlertsToday(userId, day),
    habitsToday(userId, day),
    upcomingExamClashes(userId, day, 7),
  ]);
  // En embarazo o posparto no aplican los avisos de peso, grasa ni tope de lanzamientos.
  const ruleAlerts = women && women.mode !== "NONE" ? allRuleAlerts.filter((a) => !/^(weight|fat|throw)/.test(a.id)) : allRuleAlerts;
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  // Versión suave sugerida para la sesión planificada de hoy (síntomas o ciclo; cálculo local).
  const planned = sessions.filter((s) => s.status === "PLANNED").map((s) => s.id);
  const lightDay = planned.length
    ? await prisma.planDay.findFirst({ where: { userId, sessionId: { in: planned }, light: { not: Prisma.AnyNull }, mode: null }, select: { sessionId: true } })
    : null;
  const lightReason = lightDay ? ((await cycleToday(userId, day))?.suggestion ?? null) : null;
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
    ruleAlerts,
    /** Salud de la mujer (cifrado; solo su dueña ve el panel de Inicio). */
    womenAlerts: women?.alerts ?? [],
    /** Sesiones planificadas de hoy y mañana: se guardan para verlas sin conexión. */
    offlinePaths: [...sessions.filter((s) => s.status === "PLANNED"), ...tomorrow].map((s) => `/training/${s.id}`),
    habits,
    nextExam: study.nextExam,
    examClashes: study.clashes,
    lightSuggestion: lightDay && lightReason ? { sessionId: lightDay.sessionId!, reason: lightReason } : null,
  };
}
