import "server-only";

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { type Alert, type DayCheck, evaluateRules, throwCap, type ThrowSession, weeklyThrows } from "./engine";
import { getPrefs } from "./prefs-service";

/** Pruebas que cuentan como lanzamientos (la pelota u otros implementos van en OTHER). */
const THROW_EVENTS = ["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"] as const;
/** Una competición sin intentos registrados cuenta como 6 lanzamientos. */
const COMPETITION_THROWS = 6;

export async function loadRuleInputs(userId: string, day: string, days = 63) {
  const from = addDays(dateOnly(day), -days);
  const to = dateOnly(day);
  const [metrics, sessions] = await Promise.all([
    prisma.recoveryMetrics.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, squeezePain: true, heelPain: true, jumpCm: true, elbowSymptoms: true, bodyWeightKg: true, bodyFatPct: true, hrvRmssdMs: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, status: "COMPLETED", date: { gte: from, lte: to }, technical: { event: { in: [...THROW_EVENTS] } } },
      select: { date: true, technical: { select: { isCompetition: true, videoTotal: true, videoElbowOk: true, videoHeadOk: true, _count: { select: { attempts: true } } } } },
    }),
  ]);
  const checks: DayCheck[] = metrics.map(({ date, ...m }) => ({ date: toIsoDay(date), ...m }));
  const throws: ThrowSession[] = sessions.map((s) => {
    const t = s.technical!;
    const n = t._count.attempts;
    return {
      date: toIsoDay(s.date),
      throws: n || (t.isCompetition ? COMPETITION_THROWS : 0),
      videoTotal: t.videoTotal,
      videoElbowOk: t.videoElbowOk,
      videoHeadOk: t.videoHeadOk,
    };
  });
  return { checks, throws };
}

/** Avisos de hoy según «Mis reglas». */
export async function rulesToday(userId: string, day: string): Promise<Alert[]> {
  const [prefs, { checks, throws }] = await Promise.all([getPrefs(userId), loadRuleInputs(userId, day)]);
  return evaluateRules({ today: day, prefs, checks, throws });
}

/** Lanzamientos por semana con el tope (para la vista semanal). */
export async function throwWeeks(userId: string, day: string, n = 5) {
  const [prefs, { throws }] = await Promise.all([getPrefs(userId), loadRuleInputs(userId, day, n * 7 + 7)]);
  const weeks = weeklyThrows(throws, day, n);
  return { weeks, cap: throwCap(weeks, prefs.throwCapRatio) };
}
