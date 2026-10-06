import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { cycleSchema } from "@/lib/planning/schemas";
import { prisma } from "@/lib/prisma";

const query = z.object({ athleteId: z.string().optional(), from: isoDate.optional(), to: isoDate.optional() });

/** Ciclos que se solapan con [from, to]. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, query);
  const userId = await resolveAthleteId(user, q.athleteId, "PLANNING");
  return prisma.trainingCycle.findMany({
    where: {
      userId,
      endDate: q.from ? { gte: dateOnly(q.from) } : undefined,
      startDate: q.to ? { lte: dateOnly(q.to) } : undefined,
    },
    orderBy: [{ startDate: "asc" }, { level: "asc" }],
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "PLANNING", "write");
  const data = await parseBody(req, cycleSchema);
  if (data.parentId) {
    const parent = await prisma.trainingCycle.findFirst({ where: { id: data.parentId, userId } });
    if (!parent) throw new ApiError(400, "El ciclo padre no existe");
    if (data.startDate < parent.startDate.toISOString().slice(0, 10) || data.endDate > parent.endDate.toISOString().slice(0, 10)) {
      throw new ApiError(400, "El ciclo debe estar dentro de las fechas del ciclo padre");
    }
  }
  const cycle = await prisma.trainingCycle.create({
    data: { ...data, userId, startDate: dateOnly(data.startDate), endDate: dateOnly(data.endDate) },
  });
  return NextResponse.json(cycle, { status: 201 });
});
