import "server-only";

import { today, toIsoDay } from "@/lib/dates";
import { cashflow, frequentCategories, listAccounts, listTransactions } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

/** Datos variables de `/finance` (v2.11 B3 · O16): los usa la página y `GET /api/finance/overview` para recargar solo la zona. */
export async function financeOverview(userId: string) {
  const todayIso = toIsoDay(today());
  const [accounts, categories, flow, recent, frequent] = await Promise.all([
    listAccounts(userId),
    prisma.financialCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    cashflow(userId, 1),
    listTransactions(userId, { limit: 12 }),
    frequentCategories(userId, todayIso),
  ]);
  const month = flow.at(-1);
  return { accounts, categories, month: { incomeCents: month?.incomeCents ?? 0, expenseCents: month?.expenseCents ?? 0 }, recent, frequent };
}
export type FinanceOverview = Awaited<ReturnType<typeof financeOverview>>;

