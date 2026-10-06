import { NextResponse } from "next/server";
import { z } from "zod";

import { buildWeeklySnapshot, generateWeeklyCoachReport } from "@/lib/ai/coach";
import { enforceRateLimit, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, startOfIsoWeek, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** Informes previos. ?preview=1 devuelve el snapshot de la semana sin llamar a Gemini. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ athleteId: z.string().optional(), preview: z.string().optional(), weekOf: isoDate.optional() }));
  const userId = await resolveAthleteId(user, q.athleteId, "REPORTS");
  if (q.preview) {
    return buildWeeklySnapshot(userId, startOfIsoWeek(q.weekOf ? dateOnly(q.weekOf) : addDays(today(), -7)));
  }
  return prisma.coachReport.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: 12 });
});

/**
 * Genera (o regenera) el informe de una semana. Por defecto, la semana ISO
 * anterior completa. Pensado para lanzarse cada lunes (cron) o a demanda.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiGenerate", user.id);
  const body = await parseBody(req, z.object({ athleteId: z.string().optional(), weekOf: isoDate.optional() }));
  const userId = await resolveAthleteId(user, body.athleteId, "REPORTS");
  const report = await generateWeeklyCoachReport(userId, body.weekOf ? dateOnly(body.weekOf) : addDays(today(), -7));
  return NextResponse.json(report, { status: 201 });
});
