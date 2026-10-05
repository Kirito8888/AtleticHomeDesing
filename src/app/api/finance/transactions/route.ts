import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { createTransaction, createTransactionSchema } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

const query = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, query);
  return prisma.financialTransaction.findMany({
    where: {
      userId: user.id,
      date: { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined },
      postings: q.accountId || q.categoryId ? { some: { accountId: q.accountId, categoryId: q.categoryId } } : undefined,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: q.limit,
    include: {
      postings: {
        include: {
          account: { select: { name: true, type: true } },
          category: { select: { name: true, color: true } },
        },
      },
    },
  });
});

/**
 * Dos modos:
 *  - simple: { mode:"simple", kind:"EXPENSE"|"INCOME"|"TRANSFER", amountCents, moneyAccountId, ... }
 *  - split:  { mode:"split", postings:[{accountId, amountCents±}, ...] } — debe sumar 0
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const tx = await createTransaction(user.id, await parseBody(req, createTransactionSchema));
  return NextResponse.json(tx, { status: 201 });
});
