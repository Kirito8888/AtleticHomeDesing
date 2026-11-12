import "server-only";

import { toIsoDay } from "@/lib/dates";
import { moneySummary } from "@/lib/finance/balances";
import { listAccounts, listTransactions } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

export const HISTORY_PAGE = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export type HistoryParams = { kind?: string; account?: string; month?: string; from?: string; to?: string; limit?: string };

/** Filtros del historial ya validados (puro). Un mes sin rango propio se expande a su primer y último día. */
export function parseHistoryParams(p: HistoryParams) {
  const kind = p.kind === "expense" ? ("EXPENSE" as const) : p.kind === "income" ? ("INCOME" as const) : undefined;
  const month = p.month && MONTH.test(p.month) ? p.month : undefined;
  let from = p.from && DAY.test(p.from) ? p.from : undefined;
  let to = p.to && DAY.test(p.to) ? p.to : undefined;
  if (month && !from && !to) {
    const [y, m] = month.split("-").map(Number);
    from = `${month}-01`;
    to = toIsoDay(new Date(Date.UTC(y, m, 0)));
  }
  const limit = Math.min(Math.max(Number(p.limit) || HISTORY_PAGE, HISTORY_PAGE), 1000);
  return { kind, month, from, to, limit };
}

/** Datos del historial (v2.11 B3 · O16): los usa la página y `GET /api/finance/history` para recargar solo la lista. */
export async function historyView(userId: string, p: HistoryParams) {
  const [accounts, categories] = await Promise.all([
    listAccounts(userId),
    prisma.financialCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  const { money, netCents } = moneySummary(accounts);
  const f = parseHistoryParams(p);
  const accountId = money.find((a) => a.id === p.account)?.id;
  const rows = await listTransactions(userId, { accountId, kind: f.kind, from: f.from, to: f.to, limit: f.limit + 1 });
  const shownAccount = money.find((a) => a.id === accountId);
  return {
    accounts,
    categories,
    rows: rows.slice(0, f.limit),
    more: rows.length > f.limit,
    limit: f.limit,
    filtered: Boolean(f.kind || accountId || f.from || f.to),
    balanceLabel: shownAccount ? shownAccount.name : "Balance total",
    balanceCents: shownAccount ? shownAccount.balanceCents : netCents,
  };
}
export type HistoryView = Awaited<ReturnType<typeof historyView>>;
