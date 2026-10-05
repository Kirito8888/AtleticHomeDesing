import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  effectiveFrom: isoDate,
  kcal: z.number().int().min(800).max(10_000),
  proteinG: z.number().int().min(0).max(600),
  carbsG: z.number().int().min(0).max(1500),
  fatG: z.number().int().min(0).max(500),
  fiberG: z.number().int().min(0).max(150).nullish(),
  trainingDayKcalFactor: z.number().min(1).max(1.6).default(1),
});

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.nutritionGoal.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { effectiveFrom, ...data } = await parseBody(req, schema);
  const date = dateOnly(effectiveFrom);
  const goal = await prisma.nutritionGoal.upsert({
    where: { userId_effectiveFrom: { userId: user.id, effectiveFrom: date } },
    create: { userId: user.id, effectiveFrom: date, ...data },
    update: data,
  });
  return NextResponse.json(goal, { status: 201 });
});
