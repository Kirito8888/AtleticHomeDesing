import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { APPLE_FITNESS } from "@/lib/strava/policy";
import type { ParsedActivity } from "@/lib/training/activity-import";
import { previewParsed } from "@/lib/training/activity-import-service";
import { createTrainingSession, recomputeSessionsTss } from "@/lib/training/service";

import { canHoldTrack, compareWorkout, mergePatch, type CompareRow, type WatchValues, type WebValues } from "./compare";
import { normalizeWorkout } from "./normalize";
import type { WorkoutInput } from "./payload";

/** Guarda en la bandeja (borrador) lo recibido. Idempotente: un reenvío, o el mismo entreno con otro nombre localizado, no duplica. */
export async function ingestWorkouts(userId: string, workouts: WorkoutInput[]) {
  const rows = workouts.map(normalizeWorkout);
  // Dentro del mismo envío también puede haber repetidos
  const unique = [...new Map(rows.map((r) => [r.dedupeKey, r])).values()];
  const { count } = await prisma.externalWorkout.createMany({
    data: unique.map((r) => ({
      userId,
      source: APPLE_FITNESS,
      dedupeKey: r.dedupeKey,
      date: dateOnly(r.date),
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      activityName: r.activityName,
      modality: r.modality,
      durationSec: r.durationSec,
      distanceM: r.distanceM,
      hrAvg: r.hrAvg,
      hrMax: r.hrMax,
      kcal: r.kcal,
    })),
    skipDuplicates: true,
  });
  return { received: workouts.length, added: count, duplicates: workouts.length - count };
}

export interface PendingSessionView {
  id: string;
  title: string | null;
  type: WebValues["type"];
  status: string;
  rows: CompareRow[];
}

export interface PendingView {
  id: string;
  date: string;
  startedAt: string;
  activityName: string;
  modality: string;
  watch: WatchValues;
  /** Sesiones propias de ese día (sin origen externo) con su comparativa. */
  sessions: PendingSessionView[];
}

const webValues = (s: { type: WebValues["type"]; durationSec: number | null; kcal: number | null; track: { distanceM: number | null; hrAvg: number | null; hrMax: number | null } | null }): WebValues => ({
  type: s.type,
  durationSec: s.durationSec,
  distanceM: s.track?.distanceM ?? null,
  hrAvg: s.track?.hrAvg ?? null,
  hrMax: s.track?.hrMax ?? null,
  kcal: s.kcal,
  hasTrack: Boolean(s.track),
});

const watchValues = (w: { durationSec: number; distanceM: number | null; hrAvg: number | null; hrMax: number | null; kcal: number | null }): WatchValues => ({
  durationSec: w.durationSec,
  distanceM: w.distanceM,
  hrAvg: w.hrAvg,
  hrMax: w.hrMax,
  kcal: w.kcal,
});

/** Pendientes de la usuaria con la comparativa frente a lo que ya registró ese día (2 consultas). */
export async function listPending(userId: string): Promise<PendingView[]> {
  const pending = await prisma.externalWorkout.findMany({ where: { userId, status: "PENDING" }, orderBy: { startedAt: "desc" }, take: 100 });
  if (!pending.length) return [];
  const sessions = await prisma.trainingSession.findMany({
    where: { userId, source: null, status: { in: ["COMPLETED", "PLANNED"] }, date: { in: [...new Set(pending.map((p) => p.date.getTime()))].map((t) => new Date(t)) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, date: true, title: true, type: true, status: true, durationSec: true, kcal: true, track: { select: { distanceM: true, hrAvg: true, hrMax: true } } },
  });
  return pending.map((p) => {
    const watch = watchValues(p);
    return {
      id: p.id,
      date: toIsoDay(p.date),
      startedAt: p.startedAt.toISOString(),
      activityName: p.activityName,
      modality: p.modality,
      watch,
      sessions: sessions
        .filter((s) => s.date.getTime() === p.date.getTime())
        .map((s) => ({ id: s.id, title: s.title, type: s.type, status: s.status, rows: compareWorkout(watch, webValues(s)) })),
    };
  });
}

export async function pendingCount(userId: string) {
  return prisma.externalWorkout.count({ where: { userId, status: "PENDING" } });
}

const conflict = () => new ApiError(409, "Este entreno ya estaba resuelto");

/** Borrador de la usuaria: 404 si no existe o es de otra persona (sin distinguir), 409 si ya se resolvió. */
async function loadPending(userId: string, id: string) {
  const w = await prisma.externalWorkout.findFirst({ where: { id, userId } });
  if (!w) throw new ApiError(404, "Entreno no encontrado");
  if (w.status !== "PENDING") throw conflict();
  return w;
}

/** Completa los huecos de una sesión propia con los datos del reloj (no pisa nada) y recalcula carga. */
export async function mergeWorkout(userId: string, id: string, sessionId: string) {
  const w = await loadPending(userId, id);
  // Solo sesiones propias y sin origen externo: nunca una de Strava ni una aparte de Apple
  const s = await prisma.trainingSession.findFirst({
    where: { id: sessionId, userId, source: null, date: w.date },
    select: { id: true, date: true, type: true, status: true, durationSec: true, startedAt: true, kcal: true, track: { select: { id: true, distanceM: true, hrAvg: true, hrMax: true } } },
  });
  if (!s) throw new ApiError(404, "Sesión no encontrada ese día");
  const patch = mergePatch(watchValues(w), webValues(s));
  await prisma.$transaction(async (tx) => {
    const claim = await tx.externalWorkout.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "MERGED", sessionId: s.id, resolvedAt: new Date() } });
    if (claim.count === 0) throw conflict();
    await tx.trainingSession.update({
      where: { id: s.id },
      data: {
        ...(patch.durationSec != null ? { durationSec: patch.durationSec } : {}),
        ...(patch.kcal != null ? { kcal: patch.kcal } : {}),
        ...(s.startedAt ? {} : { startedAt: w.startedAt }),
        // Lo planificado que el reloj demuestra hecho pasa a completado
        ...(s.status === "PLANNED" ? { status: "COMPLETED" as const } : {}),
      },
    });
    const track = { distanceM: patch.distanceM, hrAvg: patch.hrAvg, hrMax: patch.hrMax };
    if (track.distanceM != null || track.hrAvg != null || track.hrMax != null) {
      if (s.track) await tx.trackSession.update({ where: { id: s.track.id }, data: { ...(track.distanceM != null ? { distanceM: track.distanceM } : {}), ...(track.hrAvg != null ? { hrAvg: track.hrAvg } : {}), ...(track.hrMax != null ? { hrMax: track.hrMax } : {}) } });
      else if (canHoldTrack(s.type)) await tx.trackSession.create({ data: { sessionId: s.id, modality: w.modality, ...track, hrZoneSeconds: [] } });
    }
  });
  await recomputeSessionsTss(userId, s.date);
  return { ok: true, sessionId: s.id, filled: Object.keys(patch) };
}

/** Crea una sesión aparte (origen privado: fuera de la IA y de la entrenadora, igual que Strava). */
export async function importWorkout(userId: string, id: string) {
  const w = await loadPending(userId, id);
  const claim = await prisma.externalWorkout.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "IMPORTED", resolvedAt: new Date() } });
  if (claim.count === 0) throw conflict();
  try {
    const a: ParsedActivity = {
      format: "Apple",
      device: "Apple Watch",
      sport: null,
      modality: w.modality,
      surface: null,
      startedAt: w.startedAt,
      date: toIsoDay(w.date),
      elapsedSec: w.durationSec,
      movingSec: w.durationSec,
      distanceM: w.distanceM,
      hrAvg: w.hrAvg,
      hrMax: w.hrMax,
      elevationGainM: null,
      avgCadence: null,
      samples: [],
    };
    const { payload } = await previewParsed(userId, a);
    const created = await createTrainingSession(userId, null, { ...payload, title: w.activityName, kcal: w.kcal }, { keep: { source: APPLE_FITNESS, externalId: `apple:${w.dedupeKey}` } });
    await prisma.externalWorkout.update({ where: { id }, data: { sessionId: created.id } });
    return { ok: true, sessionId: created.id };
  } catch (err) {
    await prisma.externalWorkout.updateMany({ where: { id, userId, status: "IMPORTED" }, data: { status: "PENDING", resolvedAt: null } });
    throw err;
  }
}

export async function discardWorkout(userId: string, id: string) {
  await loadPending(userId, id);
  const r = await prisma.externalWorkout.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "DISCARDED", resolvedAt: new Date() } });
  if (r.count === 0) throw conflict();
  return { ok: true };
}
