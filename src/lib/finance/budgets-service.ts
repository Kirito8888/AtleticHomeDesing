import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { budgetProgress, distribution, monthWindow, type Slice } from "./budgets";

type Tx = Prisma.TransactionClient;

/** Presupuestos mensuales que cubren (aunque sea en parte) el mes. */
function overlapping(userId: string, start: Date, end: Date): Prisma.BudgetWhereInput {
  return { userId, period: "MONTHLY", startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] };
}

/**
 * Presupuestos mensuales frente al gasto real de un mes, más el reparto del gasto.
 * Cada presupuesto cuenta el gasto de su categoría y de sus subcategorías.
 */
export async function monthlyBudgetView(userId: string, month: string) {
  const { start, end } = monthWindow(month);
  const [budgets, categories, spentRows] = await Promise.all([
    prisma.budget.findMany({ where: overlapping(userId, start, end), orderBy: { startDate: "desc" } }),
    prisma.financialCategory.findMany({ where: { userId }, select: { id: true, parentId: true, name: true, kind: true, color: true } }),
    prisma.posting.groupBy({
      by: ["categoryId"],
      where: { account: { userId, type: "EXPENSE" }, transaction: { userId, date: { gte: start, lte: end } } },
      _sum: { amountCents: true },
    }),
  ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const descendants = (id: string): string[] => [id, ...categories.filter((c) => c.parentId === id).flatMap((c) => descendants(c.id))];
  const spentOf = new Map(spentRows.map((r) => [r.categoryId, r._sum.amountCents ?? 0]));
  const spentIn = (id: string) => descendants(id).reduce((s, c) => s + (spentOf.get(c) ?? 0), 0);

  // Un solo presupuesto por categoría y mes: si hubiera dos (cambio a mitad de mes), vale el más reciente.
  const seen = new Set<string>();
  const items = budgets
    .filter((b) => (seen.has(b.categoryId) ? false : (seen.add(b.categoryId), true)))
    .flatMap((b) => {
      const cat = byId.get(b.categoryId);
      if (!cat) return [];
      const spentCents = spentIn(b.categoryId);
      return [{ id: b.id, categoryId: b.categoryId, name: cat.name, color: cat.color, budgetCents: b.amountCents, spentCents, alertThresholdPct: b.alertThresholdPct, ...budgetProgress(spentCents, b.amountCents, b.alertThresholdPct) }];
    })
    .sort((a, b) => b.pct - a.pct);

  // Reparto: una parte por categoría de nivel superior (su gasto incluye subcategorías) + sin categoría.
  const rootOf = (id: string): string => {
    let c = byId.get(id);
    while (c?.parentId && byId.has(c.parentId)) c = byId.get(c.parentId);
    return c?.id ?? id;
  };
  const perRoot = new Map<string, number>();
  for (const r of spentRows) {
    const key = r.categoryId ? rootOf(r.categoryId) : "_none";
    perRoot.set(key, (perRoot.get(key) ?? 0) + (r._sum.amountCents ?? 0));
  }
  const slices: Slice[] = distribution([...perRoot].map(([key, cents]) => ({ key, name: key === "_none" ? "Sin categoría" : (byId.get(key)?.name ?? "Otra"), cents })));

  const budgeted = new Set(items.map((i) => i.categoryId));
  const unbudgeted = [...perRoot]
    .filter(([key, cents]) => key !== "_none" && cents > 0 && !budgeted.has(key))
    .map(([key, cents]) => ({ categoryId: key, name: byId.get(key)?.name ?? "Otra", spentCents: cents }))
    .sort((a, b) => b.spentCents - a.spentCents);

  const totalSpentCents = [...perRoot.values()].reduce((s, v) => s + v, 0);
  const totalBudgetCents = items.reduce((s, i) => s + i.budgetCents, 0);
  return {
    month,
    items,
    unbudgeted,
    slices,
    totalSpentCents,
    totalBudgetCents,
    expenseCategories: categories.filter((c) => c.kind === "EXPENSE").map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}

/** Cierra (o borra, si empezó este mes) los presupuestos mensuales vigentes antes de `month`. */
async function closeBefore(tx: Tx, userId: string, categoryId: string, start: Date, end: Date) {
  const current = await tx.budget.findMany({ where: { ...overlapping(userId, start, end), categoryId } });
  for (const b of current) {
    if (b.startDate >= start) await tx.budget.delete({ where: { id: b.id } });
    else await tx.budget.update({ where: { id: b.id }, data: { endDate: addDays(start, -1) } });
  }
}

/**
 * Fija el presupuesto mensual de una categoría a partir de `month`. Los meses anteriores
 * conservan su importe (el presupuesto vigente se cierra el día anterior y se abre uno nuevo).
 */
export async function setMonthlyBudget(userId: string, input: { categoryId: string; amountCents: number; alertThresholdPct: number; month: string }) {
  const cat = await prisma.financialCategory.findFirst({ where: { id: input.categoryId, userId } });
  if (!cat) throw new ApiError(404, "Categoría no encontrada");
  if (cat.kind !== "EXPENSE") throw new ApiError(400, "Solo las categorías de gasto admiten presupuesto");
  const { start } = monthWindow(input.month);
  return prisma.$transaction(async (tx) => {
    // Los que empiezan después del mes se solapan con el nuevo: se retiran para no duplicar.
    await tx.budget.deleteMany({ where: { userId, categoryId: cat.id, period: "MONTHLY", startDate: { gt: start } } });
    await closeBefore(tx, userId, cat.id, start, new Date(Date.UTC(9999, 0, 1)));
    return tx.budget.create({
      data: { userId, categoryId: cat.id, period: "MONTHLY", amountCents: input.amountCents, alertThresholdPct: input.alertThresholdPct, startDate: start },
    });
  });
}

/** Quita el presupuesto de la categoría desde `month` en adelante (los meses anteriores no cambian). */
export async function deleteMonthlyBudget(userId: string, id: string, month: string) {
  const b = await prisma.budget.findFirstOrThrow({ where: { id, userId } });
  const { start } = monthWindow(month);
  await prisma.$transaction(async (tx) => {
    await tx.budget.deleteMany({ where: { userId, categoryId: b.categoryId, period: "MONTHLY", startDate: { gte: start } } });
    await tx.budget.updateMany({
      where: { userId, categoryId: b.categoryId, period: "MONTHLY", startDate: { lt: start }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      data: { endDate: addDays(start, -1) },
    });
  });
  return { ok: true, until: toIsoDay(addDays(start, -1)) };
}
