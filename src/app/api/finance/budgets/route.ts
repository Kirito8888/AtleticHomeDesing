import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { isMonth } from "@/lib/finance/budgets";
import { monthlyBudgetView, setMonthlyBudget } from "@/lib/finance/budgets-service";
import { budgetsStatus } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

/** Presupuestos activos con gasto del periodo actual y estado OK/WARNING/EXCEEDED; con `?month=AAAA-MM`, la vista de ese mes. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const month = req.nextUrl.searchParams.get("month");
  if (month !== null) {
    if (!isMonth(month)) throw new ApiError(400, "Mes no válido (AAAA-MM)");
    return monthlyBudgetView(user.id, month);
  }
  return budgetsStatus(user.id);
});

const monthlySchema = z.object({
  categoryId: z.string(),
  amountCents: z.number().int().positive(),
  alertThresholdPct: z.number().int().min(1).max(100).default(80),
  month: z.string().refine(isMonth, "Mes no válido (AAAA-MM)"),
});

/** Fija el presupuesto mensual de una categoría desde ese mes; los anteriores no cambian. */
export const PUT = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await setMonthlyBudget(user.id, await parseBody(req, monthlySchema)));
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
