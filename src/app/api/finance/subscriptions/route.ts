import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { subscriptionsOverview } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  return subscriptionsOverview(user.id);
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  amountCents: z.number().int().positive(),
  interval: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  nextChargeDate: isoDate,
  accountId: z.string(),
  categoryId: z.string().nullish(),
  autoPost: z.boolean().default(false),
  url: z.string().url().max(300).nullish(),
  notes: z.string().max(500).nullish(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parseBody(req, schema);
  await prisma.financialAccount.findFirstOrThrow({ where: { id: data.accountId, userId: user.id } });
  if (data.categoryId) await prisma.financialCategory.findFirstOrThrow({ where: { id: data.categoryId, userId: user.id } });
  const sub = await prisma.subscription.create({
    data: { ...data, userId: user.id, nextChargeDate: dateOnly(data.nextChargeDate) },
  });
  return NextResponse.json(sub, { status: 201 });
});
