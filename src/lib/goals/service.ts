import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, today, toIsoDay } from "@/lib/dates";
import { goalProgress, type GoalInput, type GoalKindKey } from "@/lib/goals/goals";
import { prisma } from "@/lib/prisma";
import { habitStreak } from "@/lib/study/schedule";
import type { TechnicalEvent } from "@/generated/prisma/client";

type GoalLike = { id: string; kind: GoalKindKey; linkRef: string | null; current: number | null };

/**
 * Valor actual de cada objetivo a partir de los datos que ya hay (marcas, tests, hábitos, gastos).
 * Una consulta por tipo de objetivo (no por objetivo); todo acotado a `userId`.
 */
async function currentValues(userId: string, goals: GoalLike[]): Promise<Map<string, number | null>> {
  const refs = (kind: GoalKindKey) => [...new Set(goals.filter((g) => g.kind === kind).map((g) => g.linkRef ?? ""))];
  const [marks, tests, habitLogs, spent] = await Promise.all([
    refs("MARK").length
      ? prisma.personalRecord.groupBy({
          by: ["technicalEvent"],
          where: { userId, kind: "TECHNICAL_MARK", technicalEvent: { in: refs("MARK") as TechnicalEvent[] }, isEstimated: false },
          _max: { value: true },
        })
      : [],
    refs("TEST").length
      ? prisma.testResult.findMany({ where: { userId, testKey: { in: refs("TEST") } }, orderBy: { date: "desc" }, distinct: ["testKey"], select: { testKey: true, value: true } })
      : [],
    refs("HABIT").length ? prisma.habitLog.findMany({ where: { userId, habitId: { in: refs("HABIT") } }, select: { habitId: true, date: true } }) : [],
    refs("BUDGET").length
      ? (() => {
          const t = today();
          const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
          return prisma.posting.groupBy({
            by: ["categoryId"],
            where: { categoryId: { in: refs("BUDGET") }, account: { userId, type: "EXPENSE" }, transaction: { date: { gte: from, lte: t } } },
            _sum: { amountCents: true },
          });
        })()
      : [],
  ]);
  const markBest = new Map(marks.map((m) => [m.technicalEvent as string | null, m._max.value]));
  const testLast = new Map(tests.map((r) => [r.testKey, r.value]));
  const logsOf = new Map<string, string[]>();
  for (const l of habitLogs) logsOf.set(l.habitId, [...(logsOf.get(l.habitId) ?? []), toIsoDay(l.date)]);
  const spentOf = new Map(spent.map((r) => [r.categoryId, r._sum.amountCents ?? 0]));
  const todayIso = toIsoDay(today());

  return new Map(
    goals.map((g) => {
      const ref = g.linkRef ?? "";
      const v =
        g.kind === "CUSTOM" ? g.current
        : g.kind === "MARK" ? (markBest.get(ref) ?? null)
        : g.kind === "TEST" ? (testLast.get(ref) ?? null)
        : g.kind === "HABIT" ? habitStreak(logsOf.get(ref) ?? [], todayIso).current
        : (spentOf.get(ref) ?? 0);
      return [g.id, v];
    }),
  );
}

export async function listGoals(userId: string) {
  const goals = await prisma.goal.findMany({ where: { userId }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  const values = await currentValues(userId, goals);
  return goals.map((g) => ({
    ...g,
    dueOn: g.dueOn ? toIsoDay(g.dueOn) : null,
    progress: goalProgress(g, values.get(g.id) ?? null),
  }));
}

export async function createGoal(userId: string, input: GoalInput) {
  if ((await prisma.goal.count({ where: { userId } })) >= 50) throw new ApiError(400, "Como mucho 50 objetivos");
  if (input.kind === "HABIT" && !(await prisma.habit.findFirst({ where: { id: input.linkRef ?? "", userId } }))) throw new ApiError(400, "Hábito no encontrado");
  if (input.kind === "BUDGET" && !(await prisma.financialCategory.findFirst({ where: { id: input.linkRef ?? "", userId } }))) throw new ApiError(400, "Categoría no encontrada");
  return prisma.goal.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title,
      target: input.target,
      current: input.kind === "CUSTOM" ? (input.current ?? 0) : null,
      unit: input.unit ?? null,
      // Gasto: siempre «menos es mejor»; racha: siempre «más»
      higherIsBetter: input.kind === "BUDGET" ? false : input.kind === "HABIT" ? true : input.higherIsBetter,
      linkRef: input.kind === "CUSTOM" ? null : (input.linkRef ?? null),
      dueOn: input.dueOn ? dateOnly(input.dueOn) : null,
    },
  });
}

export async function updateGoal(userId: string, id: string, patch: { current?: number | null; done?: boolean }) {
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw new ApiError(404, "Objetivo no encontrado");
  return prisma.goal.update({
    where: { id },
    data: {
      ...(patch.current !== undefined && g.kind === "CUSTOM" ? { current: patch.current } : {}),
      ...(patch.done !== undefined ? { doneAt: patch.done ? new Date() : null } : {}),
    },
  });
}

export async function deleteGoal(userId: string, id: string) {
  const r = await prisma.goal.deleteMany({ where: { id, userId } });
  if (!r.count) throw new ApiError(404, "Objetivo no encontrado");
}
