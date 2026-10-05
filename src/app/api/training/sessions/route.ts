import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { createSessionSchema } from "@/lib/training/schemas";
import { createTrainingSession } from "@/lib/training/service";

const listQuery = z.object({
  athleteId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: z.enum(["TRACK", "TECHNICAL", "STRENGTH", "MIXED"]).optional(),
  status: z.enum(["PLANNED", "COMPLETED", "SKIPPED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, listQuery);
  const userId = await resolveAthleteId(user, q.athleteId);
  return prisma.trainingSession.findMany({
    where: {
      userId,
      type: q.type,
      status: q.status,
      date: { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: q.limit,
    include: {
      track: { select: { modality: true, distanceM: true, movingTimeSec: true, avgPaceSecPerKm: true, hrAvg: true } },
      technical: { select: { event: true, implementWeightG: true, bestMarkM: true, _count: { select: { attempts: true } } } },
      strength: { select: { tonnageKg: true, _count: { select: { sets: true } } } },
    },
  });
});

/** Crea una sesión. Un coach con canPlan puede crearla para su atleta (?athleteId=). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const athleteId = req.nextUrl.searchParams.get("athleteId");
  const userId = await resolveAthleteId(user, athleteId, "write");
  const input = await parseBody(req, createSessionSchema);
  const session = await createTrainingSession(userId, userId === user.id ? null : user.id, input);
  return NextResponse.json(session, { status: 201 });
});
