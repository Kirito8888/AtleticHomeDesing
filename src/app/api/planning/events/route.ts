import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { eventSchema } from "@/lib/planning/schemas";
import { prisma } from "@/lib/prisma";

const query = z.object({ athleteId: z.string().optional(), from: isoDate.optional(), to: isoDate.optional() });

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, query);
  const userId = await resolveAthleteId(user, q.athleteId);
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      startAt: { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined },
    },
    orderBy: { startAt: "asc" },
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "write");
  const data = await parseBody(req, eventSchema);
  if (data.endAt && data.endAt < data.startAt) throw new ApiError(400, "La fecha de fin debe ser posterior al inicio");
  if (data.cycleId) await prisma.trainingCycle.findFirstOrThrow({ where: { id: data.cycleId, userId } });
  const event = await prisma.calendarEvent.create({
    data: {
      ...data,
      userId,
      priority: data.type === "COMPETITION" ? (data.priority ?? "B") : null,
      startAt: dateOnly(data.startAt),
      endAt: data.endAt ? dateOnly(data.endAt) : null,
    },
  });
  return NextResponse.json(event, { status: 201 });
});
