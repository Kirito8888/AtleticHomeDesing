import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createTransaction, ensureDefaultAccounts, listAccounts } from "@/lib/finance/service";
import { toIsoDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  return listAccounts(user.id);
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"]),
  institution: z.string().max(100).nullish(),
  /** Saldo actual al dar de alta la cuenta (céntimos). Se registra contra "Saldo inicial". */
  openingBalanceCents: z.number().int().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { openingBalanceCents, ...data } = await parseBody(req, schema);
  const account = await prisma.financialAccount.create({ data: { ...data, userId: user.id } });
  if (openingBalanceCents) {
    const { equity } = await ensureDefaultAccounts(user.id);
    await createTransaction(user.id, {
      mode: "split",
      kind: "OPENING_BALANCE",
      date: toIsoDay(today()),
      description: `Saldo inicial ${account.name}`,
      postings: [
        { accountId: account.id, amountCents: openingBalanceCents },
        { accountId: equity.id, amountCents: -openingBalanceCents },
      ],
    });
  }
  return NextResponse.json(account, { status: 201 });
});
