import { NextResponse } from "next/server";
import { z } from "zod";

import { buildWeeklySnapshot, generateWeeklyCoachReport } from "@/lib/ai/coach";
import { enforceRateLimit, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, startOfIsoWeek, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** Quien mira con solo REPORTS no recibe VFC, sueño, FC en reposo ni agujetas (ámbito RECOVERY) del snapshot. */
async function canSeeRecovery(user: Awaited<ReturnType<typeof requireUser>>, athleteId: string | undefined, userId: string) {
  if (userId === user.id) return true;
  try {
    await resolveAthleteId(user, athleteId, "RECOVERY");
    return true;
  } catch {
    return false;
  }
}
const withoutRecovery = <T extends object>(snapshot: T) => Object.fromEntries(Object.entries(snapshot).filter(([k]) => k !== "recovery"));
const reportView = <T extends { inputSnapshot: unknown }>(r: T, seeRecovery: boolean) =>
  seeRecovery || !r.inputSnapshot || typeof r.inputSnapshot !== "object" ? r : { ...r, inputSnapshot: withoutRecovery(r.inputSnapshot) };

/** Informes previos. ?preview=1 devuelve el snapshot de la semana sin llamar a Gemini. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ athleteId: z.string().optional(), preview: z.string().optional(), weekOf: isoDate.optional() }));
  const userId = await resolveAthleteId(user, q.athleteId, "REPORTS");
  const seeRecovery = await canSeeRecovery(user, q.athleteId, userId);
  if (q.preview) {
    const snapshot = await buildWeeklySnapshot(userId, startOfIsoWeek(q.weekOf ? dateOnly(q.weekOf) : addDays(today(), -7)));
    return seeRecovery ? snapshot : withoutRecovery(snapshot);
  }
  const reports = await prisma.coachReport.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: 12 });
  return reports.map((r) => reportView(r, seeRecovery));
});

/**
 * Genera (o regenera) el informe de una semana. Por defecto, la semana ISO
 * anterior completa. Pensado para lanzarse cada lunes (cron) o a demanda.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  const body = await parseBody(req, z.object({ athleteId: z.string().optional(), weekOf: isoDate.optional() }));
  const userId = await resolveAthleteId(user, body.athleteId, "REPORTS");
  const report = await generateWeeklyCoachReport(userId, body.weekOf ? dateOnly(body.weekOf) : addDays(today(), -7));
  return NextResponse.json(reportView(report, await canSeeRecovery(user, body.athleteId, userId)), { status: 201 });
});
