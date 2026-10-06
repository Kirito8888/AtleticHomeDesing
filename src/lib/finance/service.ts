import "server-only";
import { z } from "zod";

import type { FinancialAccountType } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate, today, toIsoDay } from "@/lib/dates";
import {
  assertBalanced,
  budgetState,
  buildSimplePostings,
  LedgerError,
  nextOccurrence,
  periodWindow,
  type PostingInput,
} from "@/lib/finance/ledger";
import { prisma } from "@/lib/prisma";

const DEFAULT_ACCOUNTS: Array<{ name: string; type: FinancialAccountType }> = [
  { name: "Gastos", type: "EXPENSE" },
  { name: "Ingresos", type: "INCOME" },
  { name: "Saldo inicial", type: "EQUITY" },
];

/** Cuentas de contrapartida por defecto, creadas la primera vez que se usan. */
export async function ensureDefaultAccounts(userId: string) {
  const existing = await prisma.financialAccount.findMany({
    where: { userId, name: { in: DEFAULT_ACCOUNTS.map((a) => a.name) } },
  });
  const missing = DEFAULT_ACCOUNTS.filter((d) => !existing.some((e) => e.name === d.name));
  if (missing.length) {
    await prisma.financialAccount.createMany({ data: missing.map((m) => ({ ...m, userId })), skipDuplicates: true });
  }
  const all = await prisma.financialAccount.findMany({ where: { userId, name: { in: DEFAULT_ACCOUNTS.map((a) => a.name) } } });
  const byType = (t: FinancialAccountType) => all.find((a) => a.type === t)!;
  return { expense: byType("EXPENSE"), income: byType("INCOME"), equity: byType("EQUITY") };
}

/** Cuentas con saldo. ASSET: positivo = dinero disponible; LIABILITY: negativo = deuda. */
export async function listAccounts(userId: string) {
  await ensureDefaultAccounts(userId);
  const [accounts, sums] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.posting.groupBy({ by: ["accountId"], where: { account: { userId } }, _sum: { amountCents: true } }),
  ]);
  const balance = new Map(sums.map((s) => [s.accountId, s._sum.amountCents ?? 0]));
  return accounts.map((a) => ({ ...a, balanceCents: balance.get(a.id) ?? 0 }));
}

const cents = z.number().int().positive().max(1_000_000_000);

export const createTransactionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("simple"),
    kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
    date: isoDate,
    description: z.string().trim().min(1).max(300),
    payee: z.string().max(200).nullish(),
    amountCents: cents,
    moneyAccountId: z.string(),
    /** Opcional en gastos/ingresos (por defecto "Gastos"/"Ingresos"); obligatoria en transferencias. */
    counterAccountId: z.string().optional(),
    categoryId: z.string().nullish(),
  }),
  z.object({
    mode: z.literal("split"),
    kind: z.enum(["INCOME", "EXPENSE", "TRANSFER", "OPENING_BALANCE", "ADJUSTMENT"]),
    date: isoDate,
    description: z.string().trim().min(1).max(300),
    payee: z.string().max(200).nullish(),
    postings: z
      .array(
        z.object({
          accountId: z.string(),
          amountCents: z.number().int(),
          categoryId: z.string().nullish(),
          memo: z.string().max(200).nullish(),
        }),
      )
      .min(2)
      .max(50),
  }),
]);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

async function assertOwnership(userId: string, postings: PostingInput[]) {
  const accountIds = [...new Set(postings.map((p) => p.accountId))];
  const categoryIds = [...new Set(postings.flatMap((p) => (p.categoryId ? [p.categoryId] : [])))];
  const [accounts, categories] = await Promise.all([
    prisma.financialAccount.count({ where: { userId, id: { in: accountIds } } }),
    prisma.financialCategory.count({ where: { userId, id: { in: categoryIds } } }),
  ]);
  if (accounts !== accountIds.length) throw new ApiError(400, "Alguna cuenta no existe o no es tuya");
  if (categories !== categoryIds.length) throw new ApiError(400, "Alguna categoría no existe o no es tuya");
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
  extra: { subscriptionId?: string } = {},
) {
  let postings: PostingInput[];
  try {
    if (input.mode === "simple") {
      let counter = input.counterAccountId;
      if (!counter) {
        if (input.kind === "TRANSFER") throw new ApiError(400, "Una transferencia necesita cuenta destino");
        const defaults = await ensureDefaultAccounts(userId);
        counter = input.kind === "EXPENSE" ? defaults.expense.id : defaults.income.id;
      }
      postings = buildSimplePostings({
        kind: input.kind,
        amountCents: input.amountCents,
        moneyAccountId: input.moneyAccountId,
        counterAccountId: counter,
        categoryId: input.categoryId,
      });
    } else {
      postings = input.postings;
    }
    assertBalanced(postings);
  } catch (err) {
    if (err instanceof LedgerError) throw new ApiError(400, err.message);
    throw err;
  }
  await assertOwnership(userId, postings);

  return prisma.financialTransaction.create({
    data: {
      userId,
      date: dateOnly(input.date),
      kind: input.kind,
      description: input.description,
      payee: input.payee ?? null,
      subscriptionId: extra.subscriptionId ?? null,
      postings: {
        create: postings.map((p) => ({
          accountId: p.accountId,
          amountCents: p.amountCents,
          categoryId: p.categoryId ?? null,
          memo: p.memo ?? null,
        })),
      },
    },
    include: { postings: true },
  });
}

/** Estado de cada presupuesto en su periodo actual, incluyendo subcategorías. */
export async function budgetsStatus(userId: string, ref = today()) {
  const [budgets, categories] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, startDate: { lte: ref }, OR: [{ endDate: null }, { endDate: { gte: ref } }] },
      include: { category: true },
    }),
    prisma.financialCategory.findMany({ where: { userId }, select: { id: true, parentId: true } }),
  ]);

  const descendants = (id: string): string[] => [
    id,
    ...categories.filter((c) => c.parentId === id).flatMap((c) => descendants(c.id)),
  ];

  return Promise.all(
    budgets.map(async (b) => {
      const { start, end } = periodWindow(b.period, ref);
      const spent = await prisma.posting.aggregate({
        _sum: { amountCents: true },
        where: {
          categoryId: { in: descendants(b.categoryId) },
          account: { userId, type: "EXPENSE" },
          transaction: { date: { gte: start, lte: end } },
        },
      });
      const spentCents = spent._sum.amountCents ?? 0;
      return {
        id: b.id,
        category: { id: b.category.id, name: b.category.name, color: b.category.color, icon: b.category.icon },
        period: b.period,
        window: { start: toIsoDay(start), end: toIsoDay(end) },
        budgetCents: b.amountCents,
        spentCents,
        remainingCents: b.amountCents - spentCents,
        alertThresholdPct: b.alertThresholdPct,
        ...budgetState(spentCents, b.amountCents, b.alertThresholdPct),
      };
    }),
  );
}

/** Flujo de caja mensual: ingresos, gastos y neto de los últimos N meses. */
export async function cashflow(userId: string, months: number) {
  const now = today();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await prisma.$queryRaw<Array<{ month: Date; type: FinancialAccountType; total: bigint }>>`
    SELECT date_trunc('month', t."date")::date AS month, a."type", SUM(p."amountCents")::bigint AS total
    FROM "Posting" p
    JOIN "FinancialTransaction" t ON t.id = p."transactionId"
    JOIN "FinancialAccount" a ON a.id = p."accountId"
    WHERE t."userId" = ${userId} AND t."date" >= ${from} AND a."type" IN ('INCOME', 'EXPENSE')
    GROUP BY 1, 2
    ORDER BY 1`;

  const out: Array<{ month: string; incomeCents: number; expenseCents: number; netCents: number }> = [];
  for (let i = 0; i < months; i++) {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const key = toIsoDay(m).slice(0, 7);
    const pick = (type: FinancialAccountType) =>
      Number(rows.find((r) => toIsoDay(r.month).slice(0, 7) === key && r.type === type)?.total ?? 0);
    // Ingresos se acreditan (negativo) → se invierte el signo para mostrarlos en positivo.
    const incomeCents = -pick("INCOME") || 0; // evita "-0,00 €" cuando no hay ingresos
    const expenseCents = pick("EXPENSE");
    out.push({ month: key, incomeCents, expenseCents, netCents: incomeCents - expenseCents });
  }
  return out;
}

/** Gasto por categoría en un rango (para gráficos de tarta/barras). */
export async function spendingByCategory(userId: string, from: Date, to: Date) {
  const rows = await prisma.posting.groupBy({
    by: ["categoryId"],
    where: { account: { userId, type: "EXPENSE" }, transaction: { date: { gte: from, lte: to } } },
    _sum: { amountCents: true },
  });
  const cats = await prisma.financialCategory.findMany({
    where: { userId, id: { in: rows.flatMap((r) => (r.categoryId ? [r.categoryId] : [])) } },
  });
  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      name: cats.find((c) => c.id === r.categoryId)?.name ?? "Sin categoría",
      color: cats.find((c) => c.id === r.categoryId)?.color ?? null,
      totalCents: r._sum.amountCents ?? 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Contabiliza las suscripciones autoPost vencidas (una transacción por cada
 * cobro pendiente) y avanza nextChargeDate. Idempotente: solo procesa fechas ≤ hoy.
 */
export async function runDueSubscriptions(userId: string) {
  const now = today();
  const due = await prisma.subscription.findMany({
    where: { userId, isActive: true, autoPost: true, nextChargeDate: { lte: now } },
  });
  const posted: Array<{ subscriptionId: string; date: string; transactionId: string }> = [];
  for (const sub of due) {
    let next = sub.nextChargeDate;
    const anchor = next.getUTCDate();
    const dates: Date[] = [];
    while (next <= now) {
      dates.push(next);
      next = nextOccurrence(next, sub.interval, anchor);
    }
    // Reserva optimista: si otra ejecución (tarea programada o botón) ya avanzó
    // la fecha, no se cobra dos veces.
    const claim = await prisma.subscription.updateMany({
      where: { id: sub.id, nextChargeDate: sub.nextChargeDate },
      data: { nextChargeDate: next },
    });
    if (!claim.count) continue;
    for (const date of dates) {
      const tx = await createTransaction(
        userId,
        {
          mode: "simple",
          kind: "EXPENSE",
          date: toIsoDay(date),
          description: sub.name,
          amountCents: sub.amountCents,
          moneyAccountId: sub.accountId,
          categoryId: sub.categoryId,
        },
        { subscriptionId: sub.id },
      );
      posted.push({ subscriptionId: sub.id, date: toIsoDay(date), transactionId: tx.id });
    }
  }
  return posted;
}

/** Suscripciones con coste mensualizado y próximos cobros (30 días). */
export async function subscriptionsOverview(userId: string) {
  const subs = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { nextChargeDate: "asc" },
    include: { category: { select: { name: true, color: true } }, account: { select: { name: true } } },
  });
  const perMonth = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 } as const;
  const active = subs.filter((s) => s.isActive);
  const monthlyCents = Math.round(active.reduce((a, s) => a + s.amountCents * perMonth[s.interval], 0));
  const horizon = addDays(today(), 30);
  return {
    subscriptions: subs,
    monthlyCents,
    yearlyCents: monthlyCents * 12,
    upcoming: active.filter((s) => s.nextChargeDate <= horizon),
  };
}
