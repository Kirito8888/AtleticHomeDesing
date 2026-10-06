import "server-only";

import { prisma } from "@/lib/prisma";
import type { SetRow } from "@/lib/training/strength-progress";

/** Series de fuerza completadas del usuario desde `since` (para la gráfica de e1RM). */
export async function strengthRows(userId: string, since: Date): Promise<SetRow[]> {
  const sets = await prisma.strengthSet.findMany({
    where: { isWarmup: false, est1RmKg: { not: null }, strengthSession: { session: { userId, status: "COMPLETED", date: { gte: since } } } },
    select: {
      exerciseId: true,
      est1RmKg: true,
      weightKg: true,
      reps: true,
      isWarmup: true,
      exercise: { select: { name: true } },
      strengthSession: { select: { session: { select: { date: true } } } },
    },
  });
  return sets.map((s) => ({
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    date: s.strengthSession.session.date,
    est1RmKg: s.est1RmKg,
    weightKg: s.weightKg,
    reps: s.reps,
    isWarmup: s.isWarmup,
  }));
}
