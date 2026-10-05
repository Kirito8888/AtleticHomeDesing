import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { budgetsStatus } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

/** Presupuestos activos con gasto del periodo actual y estado OK/WARNING/EXCEEDED. */
export const GET = route(async () => {
  const user = await requireUser();
  return budgetsStatus(user.id);
});

const schema = z.object({
  categoryId: z.string(),
  period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  amountCents: z.number().int().positive(),
  alertThresholdPct: z.number().int().min(1).max(100).default(80),
  rollover: z.boolean().default(false),
  startDate: isoDate,
  endDate: isoDate.nullish(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parseBody(req, schema);
  await prisma.financialCategory.findFirstOrThrow({ where: { id: data.categoryId, userId: user.id } });
  const budget = await prisma.budget.create({
    data: {
      ...data,
      userId: user.id,
      startDate: dateOnly(data.startDate),
      endDate: data.endDate ? dateOnly(data.endDate) : null,
    },
  });
  return NextResponse.json(budget, { status: 201 });
});
