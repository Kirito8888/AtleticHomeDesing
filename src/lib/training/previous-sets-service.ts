import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { toIsoDay } from "@/lib/dates";

import type { PreviousByExercise } from "./previous-sets";

/**
 * Por ejercicio, las series de la última sesión COMPLETADA donde aparece
 * (dos consultas, independientes del nº de ejercicios). `excludeSessionId`: la que se está editando.
 */
export async function lastSetsByExercise(userId: string, opts: { excludeSessionId?: string } = {}): Promise<PreviousByExercise> {
  const latest = await prisma.$queryRaw<Array<{ exerciseId: string; sessionId: string }>>(Prisma.sql`
    SELECT DISTINCT ON (s."exerciseId") s."exerciseId", ts.id AS "sessionId"
    FROM "StrengthSet" s
    JOIN "StrengthSession" ss ON ss.id = s."strengthSessionId"
    JOIN "TrainingSession" ts ON ts.id = ss."sessionId"
    WHERE ts."userId" = ${userId}
      AND ts.status = 'COMPLETED'::"SessionStatus"
      AND ts.id <> ${opts.excludeSessionId ?? ""}
    ORDER BY s."exerciseId", ts.date DESC, ts."createdAt" DESC`);
  if (!latest.length) return {};
  const wanted = new Map(latest.map((r) => [`${r.sessionId}:${r.exerciseId}`, r.exerciseId]));
  const rows = await prisma.strengthSet.findMany({
    where: { strengthSession: { sessionId: { in: [...new Set(latest.map((r) => r.sessionId))] } }, exerciseId: { in: latest.map((r) => r.exerciseId) } },
    orderBy: { order: "asc" },
    select: { exerciseId: true, reps: true, weightKg: true, isWarmup: true, restSec: true, strengthSession: { select: { sessionId: true, session: { select: { date: true } } } } },
  });
  const out: PreviousByExercise = {};
  for (const r of rows) {
    if (!wanted.has(`${r.strengthSession.sessionId}:${r.exerciseId}`)) continue;
    (out[r.exerciseId] ??= { date: toIsoDay(r.strengthSession.session.date), sets: [] }).sets.push({ reps: r.reps, weightKg: r.weightKg, isWarmup: r.isWarmup, restSec: r.restSec });
  }
  return out;
}
