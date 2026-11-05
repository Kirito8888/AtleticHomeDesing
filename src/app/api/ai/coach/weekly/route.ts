import { NextResponse } from "next/server";
import { z } from "zod";

import { buildWeeklySnapshot, generateWeeklyCoachReport } from "@/lib/ai/coach";
import { enforceRateLimit, parseBody, parseQuery, route } from "@/lib/api";
import { redactCoachReport, recoveryValues } from "@/lib/ai/recovery-redact";
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
/**
 * Sin el ámbito RECOVERY, un informe ya guardado (p. ej. generado por la atleta con su VFC y sueño) se entrega
 * sin `inputSnapshot.recovery` y con el texto libre de la IA saneado (resumen, hallazgos, recomendaciones).
 */
const reportView = <T extends { inputSnapshot: unknown; summary: string; recommendations: unknown }>(r: T, seeRecovery: boolean) => {
  if (seeRecovery) return r;
  const snap = r.inputSnapshot && typeof r.inputSnapshot === "object" ? (r.inputSnapshot as Record<string, unknown>) : null;
  const values = recoveryValues(snap);
  const { recovery: _hidden, ...inputSnapshot } = snap ?? {};
  void _hidden;
  const rec = r.recommendations && typeof r.recommendations === "object" ? (r.recommendations as Record<string, unknown>) : null;
  const cleaned = redactCoachReport({ summary: r.summary, ...(rec ?? {}) }, values);
  const { summary, ...recommendations } = cleaned.report as { summary: string } & Record<string, unknown>;
  return {
    ...r,
    inputSnapshot: snap ? inputSnapshot : r.inputSnapshot,
    summary,
    recommendations: rec ? recommendations : r.recommendations,
    ...(cleaned.redacted ? { recoveryRedacted: true } : {}),
  };
};

/** Informes previos. ?preview=1 devuelve el snapshot de la semana sin llamar a Gemini. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ athleteId: z.string().optional(), preview: z.string().optional(), weekOf: isoDate.optional() }));
  const userId = await resolveAthleteId(user, q.athleteId, "REPORTS");
  const seeRecovery = await canSeeRecovery(user, q.athleteId, userId);
  if (q.preview) {
    return buildWeeklySnapshot(userId, startOfIsoWeek(q.weekOf ? dateOnly(q.weekOf) : addDays(today(), -7)), { recovery: seeRecovery });
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
  const seeRecovery = await canSeeRecovery(user, body.athleteId, userId);
  // Sin RECOVERY, ni el snapshot ni el prompt llevan recuperación y la respuesta del modelo se sanea antes de guardarse
  const report = await generateWeeklyCoachReport(userId, body.weekOf ? dateOnly(body.weekOf) : addDays(today(), -7), { recovery: seeRecovery });
  return NextResponse.json(reportView(report, seeRecovery), { status: 201 });
});
