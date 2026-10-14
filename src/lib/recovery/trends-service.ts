import "server-only";

import { dateOnly, toIsoDay } from "@/lib/dates";
import { hrvWeekRanges } from "@/lib/planning/plan-import/hrv-weeks";
import { prisma } from "@/lib/prisma";
import { weekOf } from "@/lib/rules/engine";
import { getPrefs } from "@/lib/rules/prefs-service";
import { feelingSchema } from "@/lib/training/schemas";

import { lastMonths, monthlyTrends, trendAlerts } from "./trends";

/**
 * Tendencias de meses de UNA usuaria (sueño, VFC, carga, molestias). Solo lee sus datos sin cifrar
 * de `RecoveryMetrics` y de sus sesiones; los datos de salud cifrados no se tocan. Cálculo local.
 */
export async function trendsFor(userId: string, day: string) {
  const prefs = await getPrefs(userId);
  const first = lastMonths(day, prefs.trendMonths)[0];
  const from = dateOnly(`${first}-01`);
  const to = dateOnly(day);
  const [metrics, sessions, ranges] = await Promise.all([
    prisma.recoveryMetrics.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true, sleepHours: true, hrvRmssdMs: true, squeezePain: true, heelPain: true } }),
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: from, lte: to } }, select: { date: true, sessionRpe: true, durationSec: true, feelings: true } }),
    hrvWeekRanges(userId),
  ]);
  const feelings = sessions.flatMap((s) => {
    const r = feelingSchema.array().safeParse(s.feelings);
    return r.success ? r.data.map((f) => ({ date: toIsoDay(s.date), pain: f.pain })) : [];
  });
  const hrvWeeks = [...new Set(ranges.flatMap((r) => [weekOf(r.start), weekOf(r.end)]))];
  const months = monthlyTrends({
    today: day,
    prefs,
    checks: metrics.map((m) => ({ ...m, date: toIsoDay(m.date) })),
    sessions: sessions.map((s) => ({ date: toIsoDay(s.date), sessionRpe: s.sessionRpe, durationSec: s.durationSec })),
    feelings,
    hrvWeeks,
  });
  return { months, alerts: trendAlerts(months, prefs), hrvWeeks: ranges.length };
}

