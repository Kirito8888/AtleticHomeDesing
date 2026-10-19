import "server-only";

import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { notFromStrava } from "@/lib/strava/policy";

import { implementBests } from "./implement-bests";

const THROWS = ["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"] as const;

/** Intentos válidos de lanzamientos (todo el historial) → los 3 mejores por implemento. `noStrava`: para la IA o terceros. */
export async function implementBestsFor(userId: string, opts: { noStrava?: boolean } = {}) {
  const attempts = await prisma.technicalAttempt.findMany({
    where: {
      isFoul: false,
      markM: { gt: 0 },
      technicalSession: { event: { in: [...THROWS] }, session: { userId, status: "COMPLETED", ...(opts.noStrava ? notFromStrava : {}) } },
    },
    select: { markM: true, technicalSession: { select: { event: true, implementWeightG: true, isCompetition: true, session: { select: { date: true } } } } },
  });
  return implementBests(
    attempts.map((a) => ({
      date: toIsoDay(a.technicalSession.session.date),
      event: a.technicalSession.event,
      implementWeightG: a.technicalSession.implementWeightG,
      markM: a.markM!,
      isCompetition: a.technicalSession.isCompetition,
    })),
  );
}
