import "server-only";

import { dayView } from "@/lib/ai-plan/day-view";
import { prisma } from "@/lib/prisma";

import { planToBlocks } from "./plan-to-form";
import { planVsDone, type PvdRow } from "./plan-vs-done";
import { rmContext } from "./rm-service";

type Ctx = Awaited<ReturnType<typeof rmContext>>;

async function doneSets(userId: string, sessionIds: string[]) {
  const sets = await prisma.strengthSet.findMany({
    where: { strengthSession: { session: { userId, id: { in: sessionIds } } } },
    select: { reps: true, weightKg: true, isWarmup: true, suggestedKg: true, exerciseId: true, exercise: { select: { name: true } }, strengthSession: { select: { sessionId: true } } },
    orderBy: { order: "asc" },
  });
  return sets.map((s) => ({ sessionId: s.strengthSession.sessionId, exerciseId: s.exerciseId, exercise: s.exercise.name, reps: s.reps, weightKg: s.weightKg, isWarmup: s.isWarmup, suggestedKg: s.suggestedKg }));
}

/** Plan frente a hecho de una sesión hecha que viene del plan (null si no aplica). */
export async function sessionPlanVsDone(userId: string, sessionId: string, ctx?: Ctx): Promise<PvdRow[] | null> {
  const day = await prisma.planDay.findFirst({ where: { userId, sessionId } });
  if (!day) return null;
  const c = ctx ?? (await rmContext(userId));
  const planned = planToBlocks(dayView(day).blocks, c).blocks;
  const done = await doneSets(userId, [sessionId]);
  if (!planned.length && !done.length) return null;
  return planVsDone(planned, done);
}

/** Tonelaje planificado frente a hecho por semana del bloque (solo días con la sesión ya registrada). */
export async function mesoWeeklyTonnage(userId: string, mesoId: string) {
  const days = await prisma.planDay.findMany({ where: { userId, mesoId, sessionId: { not: null } } });
  const done = await prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", id: { in: days.map((d) => d.sessionId!) } }, select: { id: true } });
  const doneIds = new Set(done.map((d) => d.id));
  const relevant = days.filter((d) => doneIds.has(d.sessionId!));
  if (!relevant.length) return [];
  const ctx = await rmContext(userId);
  const sets = await doneSets(userId, [...doneIds]);
  const weeks = new Map<number, { week: number; planned: number; done: number; sessions: number }>();
  for (const d of relevant) {
    const rows = planVsDone(
      planToBlocks(dayView(d).blocks, ctx).blocks,
      sets.filter((s) => s.sessionId === d.sessionId),
    );
    const w = weeks.get(d.week ?? 0) ?? { week: d.week ?? 0, planned: 0, done: 0, sessions: 0 };
    w.planned += rows.reduce((a, r) => a + (r.plan?.tonnage ?? 0), 0);
    w.done += rows.reduce((a, r) => a + (r.done?.tonnage ?? 0), 0);
    w.sessions++;
    weeks.set(w.week, w);
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week);
}
