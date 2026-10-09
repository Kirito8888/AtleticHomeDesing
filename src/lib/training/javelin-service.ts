import "server-only";

import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import type { ThrowSession } from "./javelin-insights";

/** Sesiones de jabalina hechas con sus marcas válidas, clave técnica y condiciones. */
export async function javelinSessions(userId: string): Promise<ThrowSession[]> {
  const rows = await prisma.technicalSession.findMany({
    where: { event: "JAVELIN", session: { userId, status: "COMPLETED" } },
    select: {
      implementWeightG: true,
      isCompetition: true,
      cue: true,
      conditions: true,
      session: { select: { date: true } },
      attempts: { where: { isFoul: false, markM: { gt: 0 } }, select: { markM: true } },
    },
  });
  return rows.map((r) => {
    const c = r.conditions as { tempC?: number | null; windMs?: number | null } | null;
    return {
      date: toIsoDay(r.session.date),
      implementWeightG: r.implementWeightG,
      isCompetition: r.isCompetition,
      cue: r.cue,
      marks: r.attempts.map((a) => a.markM!),
      conditions: c ? { tempC: c.tempC ?? null, windMs: c.windMs ?? null } : null,
    };
  });
}
