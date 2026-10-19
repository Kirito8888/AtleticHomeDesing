import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { hrvWeekRanges } from "@/lib/planning/plan-import/hrv-weeks";
import { prisma } from "@/lib/prisma";
import { BODY_AREA_LABEL } from "@/lib/recovery/injury-rules";
import { currentPhase, protocolPhasesSchema } from "@/lib/recovery/return-protocol";
import { familyOf } from "@/lib/training/disciplines";
import { notFromStrava } from "@/lib/strava/policy";
import { dailySrpe } from "@/lib/training/load-metrics";
import { feelingSchema } from "@/lib/training/schemas";

import { type Alert, type DayCheck, type TrackLoad, evaluateRules, type FeelingCheck, throwCap, type ThrowSession, weekOf, weeklyThrows } from "./engine";
import { getPrefs } from "./prefs-service";

/** Pruebas que cuentan como lanzamientos (la pelota u otros implementos van en OTHER). */
const THROW_EVENTS = ["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"] as const;
/** Una competición sin intentos registrados cuenta como 6 lanzamientos. */
const COMPETITION_THROWS = 6;
const JUMP_EVENTS = ["LONG_JUMP", "TRIPLE_JUMP", "HIGH_JUMP", "POLE_VAULT"] as const;

export async function loadRuleInputs(userId: string, day: string, days = 63) {
  const from = addDays(dateOnly(day), -days);
  const to = dateOnly(day);
  const [metrics, sessions, felt, recent, protocol, hrvRanges, profile, trackRows] = await Promise.all([
    prisma.recoveryMetrics.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, squeezePain: true, heelPain: true, jumpCm: true, elbowSymptoms: true, bodyWeightKg: true, bodyFatPct: true, hrvRmssdMs: true, sleepHours: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, status: "COMPLETED", date: { gte: from, lte: to }, technical: { event: { in: [...THROW_EVENTS] } }, ...notFromStrava },
      select: { date: true, technical: { select: { isCompetition: true, videoTotal: true, videoElbowOk: true, videoHeadOk: true, _count: { select: { attempts: true } } } } },
    }),
    prisma.trainingSession.findMany({
      where: { userId, status: "COMPLETED", date: { gte: addDays(to, -7), lte: to }, feelings: { not: Prisma.AnyNull }, ...notFromStrava },
      select: { date: true, feelings: true },
    }),
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: addDays(to, -6), lte: to }, ...notFromStrava }, select: { date: true, sessionRpe: true, durationSec: true } }),
    prisma.returnProtocol.findFirst({ where: { userId, injury: { resolvedOn: null } }, orderBy: { updatedAt: "desc" }, select: { phases: true } }),
    hrvWeekRanges(userId),
    prisma.athleteProfile.findUnique({ where: { userId }, select: { primaryDiscipline: true, primaryEvent: true } }),
    // Nunca lo importado de Strava: estos avisos llegan a la entrenadora y a la IA (`notFromStrava`)
    prisma.trainingSession.findMany({
      where: { userId, status: "COMPLETED", date: { gte: from, lte: to }, AND: [notFromStrava, { OR: [{ track: { isNot: null } }, { technical: { event: { in: [...JUMP_EVENTS] } } }] }] },
      select: {
        date: true,
        track: { select: { modality: true, distanceM: true, intervals: { select: { distanceM: true } } } },
        technical: { select: { event: true, isCompetition: true, _count: { select: { attempts: true } } } },
      },
    }),
  ]);
  const loads = dailySrpe(recent.map((s) => ({ ...s, date: toIsoDay(s.date) })), toIsoDay(to));
  const phases = protocol ? protocolPhasesSchema.safeParse(protocol.phases) : null;
  const returnProtocol = phases?.success ? { phase: phases.data[currentPhase(phases.data)].name } : null;
  const feelings: FeelingCheck[] = felt.flatMap((s) => {
    const r = feelingSchema.array().safeParse(s.feelings);
    return r.success ? r.data.map((f) => ({ date: toIsoDay(s.date), area: f.area, label: BODY_AREA_LABEL[f.area], pain: f.pain })) : [];
  });
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
  const family = familyOf(profile?.primaryDiscipline, profile?.primaryEvent);
  const trackLoads: TrackLoad[] = trackRows.map((s) => {
    const sets = s.track && (s.track.modality === "SPRINT" || s.track.modality === "HURDLES") ? s.track.intervals.reduce((a, i) => a + (i.distanceM ?? 0), 0) : 0;
    const t = s.technical && (JUMP_EVENTS as readonly string[]).includes(s.technical.event) ? s.technical : null;
    return {
      date: toIsoDay(s.date),
      fastM: sets,
      runKm: s.track?.modality === "RUN" ? (s.track.distanceM ?? 0) / 1000 : 0,
      jumps: t ? t._count.attempts || (t.isCompetition ? COMPETITION_THROWS : 0) : 0,
    };
  });
  const hrvWeeks = [...new Set(hrvRanges.flatMap((r) => [weekOf(r.start), weekOf(r.end)]))];
  return { checks, throws, feelings, loads, returnProtocol, hrvWeeks, family, trackLoads };
}

/** Avisos de hoy según «Mis reglas». */
export async function rulesToday(userId: string, day: string): Promise<Alert[]> {
  const [prefs, inputs] = await Promise.all([getPrefs(userId), loadRuleInputs(userId, day)]);
  return evaluateRules({ today: day, prefs, ...inputs });
}

/** Lanzamientos por semana con el tope (para la vista semanal). */
export async function throwWeeks(userId: string, day: string, n = 5) {
  const [prefs, { throws }] = await Promise.all([getPrefs(userId), loadRuleInputs(userId, day, n * 7 + 7)]);
  const weeks = weeklyThrows(throws, day, n);
  return { weeks, cap: throwCap(weeks, prefs.throwCapRatio) };
}
