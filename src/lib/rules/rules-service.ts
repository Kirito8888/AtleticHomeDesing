import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { hrvWeekRangesMany } from "@/lib/planning/plan-import/hrv-weeks";
import { prisma } from "@/lib/prisma";
import { BODY_AREA_LABEL } from "@/lib/recovery/injury-rules";
import { currentPhase, protocolPhasesSchema } from "@/lib/recovery/return-protocol";
import { familyOf } from "@/lib/training/disciplines";
import { notFromStrava } from "@/lib/strava/policy";
import { dailySrpe } from "@/lib/training/load-metrics";
import { feelingSchema } from "@/lib/training/schemas";

import { type Alert, type DayCheck, type TrackLoad, evaluateRules, type FeelingCheck, throwCap, type ThrowSession, weekOf, weeklyThrows } from "./engine";
import { getPrefs, getPrefsMany } from "./prefs-service";

/** Pruebas que cuentan como lanzamientos (la pelota u otros implementos van en OTHER). */
const THROW_EVENTS = ["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"] as const;
/** Una competición sin intentos registrados cuenta como 6 lanzamientos. */
const COMPETITION_THROWS = 6;
const JUMP_EVENTS = ["LONG_JUMP", "TRIPLE_JUMP", "HIGH_JUMP", "POLE_VAULT"] as const;

/** Agrupa por `userId` (las filas llevan el id para poder pedir a muchas personas en una consulta). */
function groupBy<T extends { userId: string }>(rows: T[]) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.userId, [...(m.get(r.userId) ?? []), r]);
  return (id: string) => m.get(id) ?? [];
}

/** Entradas de las reglas de varias personas: mismas lecturas que `loadRuleInputs`, pero con `userId: { in }` (nº de consultas fijo). */
export async function loadRuleInputsMany(userIds: string[], day: string, days = 63) {
  const from = addDays(dateOnly(day), -days);
  const to = dateOnly(day);
  const [metrics, sessions, felt, recent, protocols, hrvRanges, profiles, trackRows] = await Promise.all([
    prisma.recoveryMetrics.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: to } },
      select: { userId: true, date: true, squeezePain: true, heelPain: true, jumpCm: true, elbowSymptoms: true, bodyWeightKg: true, bodyFatPct: true, hrvRmssdMs: true, sleepHours: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId: { in: userIds }, status: "COMPLETED", date: { gte: from, lte: to }, technical: { event: { in: [...THROW_EVENTS] } }, ...notFromStrava },
      select: { userId: true, date: true, technical: { select: { isCompetition: true, videoTotal: true, videoElbowOk: true, videoHeadOk: true, _count: { select: { attempts: true } } } } },
    }),
    prisma.trainingSession.findMany({
      where: { userId: { in: userIds }, status: "COMPLETED", date: { gte: addDays(to, -7), lte: to }, feelings: { not: Prisma.AnyNull }, ...notFromStrava },
      select: { userId: true, date: true, feelings: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId: { in: userIds }, status: "COMPLETED", date: { gte: addDays(to, -6), lte: to }, ...notFromStrava },
      select: { userId: true, date: true, sessionRpe: true, durationSec: true },
    }),
    prisma.returnProtocol.findMany({ where: { userId: { in: userIds }, injury: { resolvedOn: null } }, orderBy: { updatedAt: "desc" }, select: { userId: true, phases: true } }),
    hrvWeekRangesMany(userIds),
    prisma.athleteProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, primaryDiscipline: true, primaryEvent: true } }),
    // Nunca lo importado de Strava: estos avisos llegan a la entrenadora y a la IA (`notFromStrava`)
    prisma.trainingSession.findMany({
      where: { userId: { in: userIds }, status: "COMPLETED", date: { gte: from, lte: to }, AND: [notFromStrava, { OR: [{ track: { isNot: null } }, { technical: { event: { in: [...JUMP_EVENTS] } } }] }] },
      select: {
        userId: true,
        date: true,
        track: { select: { modality: true, distanceM: true, intervals: { select: { distanceM: true } } } },
        technical: { select: { event: true, isCompetition: true, _count: { select: { attempts: true } } } },
      },
    }),
  ]);
  const of = {
    metrics: groupBy(metrics),
    sessions: groupBy(sessions),
    felt: groupBy(felt),
    recent: groupBy(recent),
    protocols: groupBy(protocols),
    profiles: groupBy(profiles),
    trackRows: groupBy(trackRows),
  };
  return new Map(
    userIds.map((id) => {
      const loads = dailySrpe(of.recent(id).map((s) => ({ ...s, date: toIsoDay(s.date) })), toIsoDay(to));
      const protocol = of.protocols(id)[0]; // ya vienen por `updatedAt` descendente: la primera es la más reciente
      const phases = protocol ? protocolPhasesSchema.safeParse(protocol.phases) : null;
      const returnProtocol = phases?.success ? { phase: phases.data[currentPhase(phases.data)].name } : null;
      const feelings: FeelingCheck[] = of.felt(id).flatMap((s) => {
        const r = feelingSchema.array().safeParse(s.feelings);
        return r.success ? r.data.map((f) => ({ date: toIsoDay(s.date), area: f.area, label: BODY_AREA_LABEL[f.area], pain: f.pain })) : [];
      });
      const checks: DayCheck[] = of.metrics(id).map((m) => ({
        date: toIsoDay(m.date),
        squeezePain: m.squeezePain,
        heelPain: m.heelPain,
        jumpCm: m.jumpCm,
        elbowSymptoms: m.elbowSymptoms,
        bodyWeightKg: m.bodyWeightKg,
        bodyFatPct: m.bodyFatPct,
        hrvRmssdMs: m.hrvRmssdMs,
        sleepHours: m.sleepHours,
      }));
      const throws: ThrowSession[] = of.sessions(id).map((s) => {
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
      const profile = of.profiles(id)[0];
      const family = familyOf(profile?.primaryDiscipline, profile?.primaryEvent);
      const trackLoads: TrackLoad[] = of.trackRows(id).map((s) => {
        const sets = s.track && (s.track.modality === "SPRINT" || s.track.modality === "HURDLES") ? s.track.intervals.reduce((a, i) => a + (i.distanceM ?? 0), 0) : 0;
        const t = s.technical && (JUMP_EVENTS as readonly string[]).includes(s.technical.event) ? s.technical : null;
        return {
          date: toIsoDay(s.date),
          fastM: sets,
          runKm: s.track?.modality === "RUN" ? (s.track.distanceM ?? 0) / 1000 : 0,
          jumps: t ? t._count.attempts || (t.isCompetition ? COMPETITION_THROWS : 0) : 0,
        };
      });
      const hrvWeeks = [...new Set((hrvRanges.get(id) ?? []).flatMap((r) => [weekOf(r.start), weekOf(r.end)]))];
      return [id, { checks, throws, feelings, loads, returnProtocol, hrvWeeks, family, trackLoads }] as const;
    }),
  );
}

export async function loadRuleInputs(userId: string, day: string, days = 63) {
  return (await loadRuleInputsMany([userId], day, days)).get(userId)!;
}

/** Avisos de hoy según «Mis reglas». */
export async function rulesToday(userId: string, day: string): Promise<Alert[]> {
  return (await rulesTodayMany([userId], day)).get(userId)!;
}

/** Avisos de hoy de varias personas con un nº fijo de consultas (panel del club). */
export async function rulesTodayMany(userIds: string[], day: string): Promise<Map<string, Alert[]>> {
  if (!userIds.length) return new Map();
  const [prefs, inputs] = await Promise.all([getPrefsMany(userIds), loadRuleInputsMany(userIds, day)]);
  return new Map(userIds.map((id) => [id, evaluateRules({ today: day, prefs: prefs.get(id)!, ...inputs.get(id)! })]));
}

/** Lanzamientos por semana con el tope (para la vista semanal). */
export async function throwWeeks(userId: string, day: string, n = 5) {
  const [prefs, { throws }] = await Promise.all([getPrefs(userId), loadRuleInputs(userId, day, n * 7 + 7)]);
  const weeks = weeklyThrows(throws, day, n);
  return { weeks, cap: throwCap(weeks, prefs.throwCapRatio) };
}
