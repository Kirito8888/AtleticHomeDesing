import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, today, toIsoDay } from "@/lib/dates";
import { goalProgress, type GoalInput, type GoalKindKey } from "@/lib/goals/goals";
import { prisma } from "@/lib/prisma";
import { habitStreak } from "@/lib/study/schedule";
import type { TechnicalEvent } from "@/generated/prisma/client";

/** Valor actual de un objetivo a partir de los datos que ya hay (marcas, tests, hábitos, gastos). */
async function currentValue(userId: string, g: { kind: GoalKindKey; linkRef: string | null; current: number | null; higherIsBetter: boolean }): Promise<number | null> {
  switch (g.kind) {
    case "CUSTOM":
      return g.current;
    case "MARK": {
      const best = await prisma.personalRecord.findFirst({
        where: { userId, kind: "TECHNICAL_MARK", technicalEvent: g.linkRef as TechnicalEvent, isEstimated: false },
        orderBy: { value: "desc" },
        select: { value: true },
      });
      return best?.value ?? null;
    }
    case "TEST": {
      const last = await prisma.testResult.findFirst({ where: { userId, testKey: g.linkRef ?? "" }, orderBy: { date: "desc" }, select: { value: true } });
      return last?.value ?? null;
    }
    case "HABIT": {
      const logs = await prisma.habitLog.findMany({ where: { userId, habitId: g.linkRef ?? "" }, select: { date: true } });
      return habitStreak(logs.map((l) => toIsoDay(l.date)), toIsoDay(today())).current;
    }
    case "BUDGET": {
      const t = today();
      const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      const sum = await prisma.posting.aggregate({
        where: { categoryId: g.linkRef ?? "", account: { userId, type: "EXPENSE" }, transaction: { date: { gte: from, lte: t } } },
        _sum: { amountCents: true },
      });
      return sum._sum.amountCents ?? 0;
    }
  }
}

export async function listGoals(userId: string) {
  const goals = await prisma.goal.findMany({ where: { userId }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  return Promise.all(
    goals.map(async (g) => ({
      ...g,
      dueOn: g.dueOn ? toIsoDay(g.dueOn) : null,
      progress: goalProgress(g, await currentValue(userId, g)),
    })),
  );
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
