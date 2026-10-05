import "server-only";

import type { z } from "zod";

import type { Prisma, TechnicalEvent, TssMethod } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { computePmc } from "@/lib/training/pmc";
import { computeReadiness } from "@/lib/training/readiness";
import type { CreateSessionInput, RecoveryInput, strengthSetSchema, trackDetailSchema } from "@/lib/training/schemas";
import { estimateOneRm, repsInReserve, tonnageKg } from "@/lib/training/strength";
import { computeSessionTss, type Thresholds } from "@/lib/training/tss";

const SWIM = "SWIM";

type PreparedSet = z.infer<typeof strengthSetSchema> & { bodyweightFactor: number; est1RmKg: number | null };

interface PrCandidates {
  technical: { event: TechnicalEvent; implementWeightG?: number | null; isCompetition: boolean; bestMarkM: number } | null;
  strengthSets: PreparedSet[];
}

/** Umbrales vigentes en una fecha (registro con mayor effectiveFrom ≤ fecha). */
export async function thresholdsAt(userId: string, date: Date): Promise<Thresholds | null> {
  return prisma.thresholdHistory.findFirst({
    where: { userId, effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
  });
}

function derivePaces(track: z.infer<typeof trackDetailSchema>) {
  const time = track.movingTimeSec;
  const dist = track.distanceM;
  if (!time || !dist) return { avgPaceSecPerKm: null, avgPaceSecPer100m: null };
  return track.modality === SWIM
    ? { avgPaceSecPerKm: null, avgPaceSecPer100m: time / (dist / 100) }
    : { avgPaceSecPerKm: time / (dist / 1000), avgPaceSecPer100m: null };
}

/**
 * Crea una sesión completa (cabecera + detalle), calcula derivados
 * (ritmos, tonelaje, 1RM estimado, mejor marca, TSS), detecta marcas
 * personales y recalcula la serie PMC desde la fecha de la sesión.
 */
export async function createTrainingSession(userId: string, plannedById: string | null, input: CreateSessionInput) {
  const date = dateOnly(input.date);
  const track = "track" in input ? input.track : null;
  const technical = "technical" in input ? input.technical : null;
  const strength = "strength" in input ? input.strength : null;

  const [profile, thresholds, exercises] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    thresholdsAt(userId, date),
    strength?.sets.length
      ? prisma.exercise.findMany({
          where: {
            id: { in: [...new Set(strength.sets.map((s) => s.exerciseId))] },
            OR: [{ userId: null }, { userId }],
          },
        })
      : Promise.resolve([]),
  ]);

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  if (strength) {
    const missing = strength.sets.find((s) => !exerciseById.has(s.exerciseId));
    if (missing) throw new ApiError(400, `Ejercicio desconocido: ${missing.exerciseId}`);
  }

  const bodyWeight = strength?.bodyWeightKg ?? profile?.bodyWeightKg ?? null;
  const strengthSets: PreparedSet[] = (strength?.sets ?? []).map((s) => {
    const ex = exerciseById.get(s.exerciseId)!;
    const load = s.weightKg + ex.bodyweightFactor * (bodyWeight ?? 0);
    return {
      ...s,
      bodyweightFactor: ex.bodyweightFactor,
      est1RmKg: s.isWarmup ? null : estimateOneRm(load, s.reps, repsInReserve(s)),
    };
  });

  const paces = track ? derivePaces(track) : { avgPaceSecPerKm: null, avgPaceSecPer100m: null };
  const validMarks = (technical?.attempts ?? []).filter((a) => !a.isFoul && a.isMeasured && a.markM != null);
  const bestMarkM = validMarks.length ? Math.max(...validMarks.map((a) => a.markM!)) : null;

  const tssResult = computeSessionTss({
    type: input.type,
    durationSec: input.durationSec,
    sessionRpe: input.sessionRpe,
    manualTss: input.manualTss,
    sex: profile?.sex,
    thresholds,
    track: track ? { ...track, ...paces } : null,
    technical: technical ? { attempts: technical.attempts.length } : null,
    strength: strength ? { sets: strengthSets, bodyWeightKg: bodyWeight } : null,
  });

  const counts = input.status === "COMPLETED";

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.trainingSession.create({
      data: {
        userId,
        plannedById,
        cycleId: input.cycleId ?? null,
        date,
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        type: input.type,
        discipline: input.discipline ?? null,
        status: input.status,
        title: input.title ?? null,
        durationSec: input.durationSec ?? null,
        sessionRpe: input.sessionRpe ?? null,
        notes: input.notes ?? null,
        tss: counts ? tssResult.tss : null,
        tssMethod: counts ? (tssResult.method as TssMethod | null) : null,
        tssComputedAt: counts && tssResult.tss != null ? new Date() : null,
        track: track
          ? {
              create: {
                modality: track.modality,
                surface: track.surface ?? null,
                distanceM: track.distanceM ?? null,
                movingTimeSec: track.movingTimeSec ?? null,
                ...paces,
                hrAvg: track.hrAvg ?? null,
                hrMax: track.hrMax ?? null,
                elevationGainM: track.elevationGainM ?? null,
                avgCadence: track.avgCadence ?? null,
                temperatureC: track.temperatureC ?? null,
                hrZoneSeconds: track.hrZoneSeconds,
                intervals: { create: track.intervals.map((iv, i) => ({ ...iv, order: i + 1 })) },
              },
            }
          : undefined,
        technical: technical
          ? {
              create: {
                event: technical.event,
                implementWeightG: technical.implementWeightG ?? null,
                implementModel: technical.implementModel ?? null,
                poleLengthCm: technical.poleLengthCm ?? null,
                poleFlex: technical.poleFlex ?? null,
                approachType: technical.approachType ?? null,
                approachSteps: technical.approachSteps ?? null,
                windMs: technical.windMs ?? null,
                isCompetition: technical.isCompetition,
                focus: technical.focus ?? null,
                bestMarkM,
                attempts: { create: technical.attempts.map((a, i) => ({ ...a, order: i + 1 })) },
              },
            }
          : undefined,
        strength: strength
          ? {
              create: {
                bodyWeightKg: bodyWeight,
                tonnageKg: tonnageKg(strengthSets, bodyWeight),
                sets: {
                  create: strengthSets.map((s, i) => ({
                    exerciseId: s.exerciseId,
                    order: i + 1,
                    setIndex: strengthSets.slice(0, i + 1).filter((x) => x.exerciseId === s.exerciseId).length,
                    reps: s.reps,
                    weightKg: s.weightKg,
                    rpe: s.rpe ?? null,
                    rir: s.rir ?? null,
                    isWarmup: s.isWarmup,
                    isFailure: s.isFailure,
                    tempo: s.tempo ?? null,
                    restSec: s.restSec ?? null,
                    velocityMs: s.velocityMs ?? null,
                    est1RmKg: s.est1RmKg,
                    notes: s.notes ?? null,
                  })),
                },
              },
            }
          : undefined,
      },
    });

    const prs = counts
      ? await detectPersonalRecords(tx, userId, created.id, date, {
          technical: technical && bestMarkM != null ? { ...technical, bestMarkM } : null,
          strengthSets,
        })
      : [];
    return { ...created, newPersonalRecords: prs };
  });

  if (counts) await recomputeDailyLoads(userId, date);
  return { ...session, tssCandidates: tssResult.candidates };
}

async function detectPersonalRecords(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  date: Date,
  data: PrCandidates,
) {
  const created = [];
  if (data.technical) {
    const t = data.technical;
    const prev = await tx.personalRecord.findFirst({
      where: {
        userId,
        kind: "TECHNICAL_MARK",
        technicalEvent: t.event,
        implementWeightG: t.implementWeightG ?? null,
      },
      orderBy: { value: "desc" },
    });
    if (!prev || t.bestMarkM > prev.value) {
      created.push(
        await tx.personalRecord.create({
          data: {
            userId,
            sessionId,
            kind: "TECHNICAL_MARK",
            technicalEvent: t.event,
            implementWeightG: t.implementWeightG ?? null,
            value: t.bestMarkM,
            isCompetition: t.isCompetition,
            achievedOn: date,
          },
        }),
      );
    }
  }

  const bestByExercise = new Map<string, { value: number; estimated: boolean }>();
  for (const s of data.strengthSets) {
    if (s.est1RmKg == null) continue;
    const estimated = !(s.reps === 1 && repsInReserve(s) === 0);
    const cur = bestByExercise.get(s.exerciseId);
    if (!cur || s.est1RmKg > cur.value) bestByExercise.set(s.exerciseId, { value: s.est1RmKg, estimated });
  }
  for (const [exerciseId, best] of bestByExercise) {
    const prev = await tx.personalRecord.findFirst({
      where: { userId, kind: "ONE_RM", exerciseId },
      orderBy: { value: "desc" },
    });
    if (!prev || best.value > prev.value) {
      created.push(
        await tx.personalRecord.create({
          data: {
            userId,
            sessionId,
            kind: "ONE_RM",
            exerciseId,
            value: Math.round(best.value * 10) / 10,
            isEstimated: best.estimated,
            achievedOn: date,
          },
        }),
      );
    }
  }
  return created;
}

/**
 * Recalcula DailyLoad desde `from` hasta hoy (o la última sesión si es futura).
 * Parte de la fila del día anterior como semilla; si no existe, desde 0 y
 * desde la primera sesión del atleta. Después refresca el readiness del rango
 * porque depende del TSB.
 */
export async function recomputeDailyLoads(userId: string, from: Date): Promise<void> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
  const seedRow = await prisma.dailyLoad.findUnique({
    where: { userId_date: { userId, date: addDays(dateOnly(from), -1) } },
  });

  const first = await prisma.trainingSession.findFirst({
    where: { userId, status: "COMPLETED", tss: { not: null } },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  if (!first) {
    await prisma.dailyLoad.deleteMany({ where: { userId } });
    return;
  }
  let start = dateOnly(from);
  if (!seedRow && first.date < start) start = first.date;

  const last = await prisma.trainingSession.findFirst({
    where: { userId, status: "COMPLETED" },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const now = today();
  const end = last && last.date > now ? last.date : now;

  const sums = await prisma.trainingSession.groupBy({
    by: ["date"],
    where: { userId, status: "COMPLETED", tss: { not: null }, date: { gte: start, lte: end } },
    _sum: { tss: true },
  });

  const series = computePmc(
    sums.map((s) => ({ date: s.date, tss: s._sum.tss ?? 0 })),
    {
      start,
      end,
      ctlDays: profile?.ctlTimeConstant ?? 42,
      atlDays: profile?.atlTimeConstant ?? 7,
      seed: seedRow ? { ctl: seedRow.ctl, atl: seedRow.atl } : undefined,
      historyStart: first.date,
    },
  );

  await prisma.$transaction([
    prisma.dailyLoad.deleteMany({ where: { userId, date: { gte: start } } }),
    prisma.dailyLoad.createMany({
      data: series.map((d) => ({ userId, date: dateOnly(d.date), tss: d.tss, ctl: d.ctl, atl: d.atl, tsb: d.tsb, acwr: d.acwr })),
    }),
  ]);

  const recoveries = await prisma.recoveryMetrics.findMany({
    where: { userId, date: { gte: start, lte: end } },
    select: { date: true },
  });
  for (const r of recoveries) await refreshReadiness(userId, r.date);
}

/** Garantiza que la serie llega hasta hoy (los días sin entreno también hacen decaer la fatiga). */
export async function ensureLoadsUpToDate(userId: string): Promise<void> {
  const latest = await prisma.dailyLoad.findFirst({ where: { userId }, orderBy: { date: "desc" } });
  const now = today();
  if (!latest) {
    await recomputeDailyLoads(userId, now);
  } else if (latest.date < now) {
    await recomputeDailyLoads(userId, addDays(latest.date, 1));
  }
}

export async function deleteTrainingSession(userId: string, id: string): Promise<void> {
  const s = await prisma.trainingSession.findFirst({ where: { id, userId }, select: { date: true } });
  if (!s) throw new ApiError(404, "Sesión no encontrada");
  await prisma.trainingSession.delete({ where: { id } });
  await recomputeDailyLoads(userId, s.date);
}

// ---------------------------------------------------------------------------
// Recuperación y readiness
// ---------------------------------------------------------------------------

const BASELINE_DAYS = 60;

export async function upsertRecovery(userId: string, input: RecoveryInput) {
  const date = dateOnly(input.date);
  const { date: _omit, ...data } = input;
  void _omit;
  await prisma.recoveryMetrics.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });
  if (input.bodyWeightKg) {
    await prisma.athleteProfile.upsert({
      where: { userId },
      create: { userId, bodyWeightKg: input.bodyWeightKg },
      update: { bodyWeightKg: input.bodyWeightKg },
    });
  }
  await ensureLoadsUpToDate(userId);
  return refreshReadiness(userId, date);
}

/** Recalcula y guarda el readiness de un día usando la línea base de los 60 días previos. */
export async function refreshReadiness(userId: string, date: Date) {
  const [row, history, load] = await Promise.all([
    prisma.recoveryMetrics.findUnique({ where: { userId_date: { userId, date } } }),
    prisma.recoveryMetrics.findMany({
      where: { userId, date: { gte: addDays(date, -BASELINE_DAYS), lt: date } },
      select: { hrvRmssdMs: true, restingHr: true },
    }),
    prisma.dailyLoad.findUnique({ where: { userId_date: { userId, date } } }),
  ]);
  if (!row) return null;

  const result = computeReadiness({
    ...row,
    tsb: load?.tsb ?? null,
    hrvHistory: history.flatMap((h) => (h.hrvRmssdMs != null ? [h.hrvRmssdMs] : [])),
    restingHrHistory: history.flatMap((h) => (h.restingHr != null ? [h.restingHr] : [])),
  });

  return prisma.recoveryMetrics.update({
    where: { id: row.id },
    data: {
      readinessScore: result.score,
      readinessParts: { ...result.parts, label: result.label, ...result.context } as Prisma.InputJsonValue,
    },
  });
}

/** Serie combinada para la gráfica PMC + panel de recuperación. */
export async function getPerformanceSeries(userId: string, days: number) {
  await ensureLoadsUpToDate(userId);
  const end = today();
  const start = addDays(end, -(days - 1));
  const [loads, recovery] = await Promise.all([
    prisma.dailyLoad.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      select: { date: true, tss: true, ctl: true, atl: true, tsb: true, acwr: true },
    }),
    prisma.recoveryMetrics.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        readinessScore: true,
        hrvRmssdMs: true,
        sleepHours: true,
        restingHr: true,
        doms: true,
      },
    }),
  ]);

  // Un punto por día del rango (aunque no haya datos) para que el eje X sea el pedido.
  const byDay = new Map<string, Record<string, unknown>>();
  for (let d = start; d <= end; d = addDays(d, 1)) byDay.set(toIsoDay(d), { date: toIsoDay(d) });
  for (const l of loads) byDay.set(toIsoDay(l.date), { ...l, date: toIsoDay(l.date) });
  for (const r of recovery) {
    const key = toIsoDay(r.date);
    byDay.set(key, { ...(byDay.get(key) ?? { date: key }), ...r, date: key });
  }
  const series = [...byDay.values()];
  const latest = loads.at(-1) ?? null;
  const weekAgo = loads.length >= 8 ? loads[loads.length - 8] : null;
  return {
    range: { start: toIsoDay(start), end: toIsoDay(end), days },
    series,
    current: latest
      ? {
          ctl: latest.ctl,
          atl: latest.atl,
          tsb: latest.tsb,
          acwr: latest.acwr,
          rampRate: weekAgo ? Math.round((latest.ctl - weekAgo.ctl) * 100) / 100 : null,
          readiness: recovery.at(-1)?.readinessScore ?? null,
        }
      : null,
  };
}
