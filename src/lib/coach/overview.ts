import "server-only";

import { type CurrentUser, resolveAthleteId } from "@/lib/auth/session";
import { addDays, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { notFromStrava } from "@/lib/strava/policy";

/**
 * v2.2 · Lo que la entrenadora ve de sus atletas (permiso de sesiones). Aquí vive el filtro de Strava
 * (sus condiciones de API: no se muestra a otras personas) para que las páginas solo pinten.
 */
export async function coachOverview(user: CurrentUser) {
  const links = await prisma.coachAthlete.findMany({
    // v1.7: sin atletas que hayan limitado el tratamiento de sus datos (art. 18 RGPD)
    where: { coachId: user.id, status: "ACTIVE", scopes: { has: "SESSIONS" }, athlete: { processingRestrictedAt: null } },
    include: { athlete: { select: { id: true, name: true, email: true } } },
  });
  const now = today();
  const ids = links.map((l) => l.athleteId);
  const [sessions, counts] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: { in: ids }, date: { gte: addDays(now, -30), lte: addDays(now, 7) }, ...notFromStrava },
      orderBy: { date: "desc" },
      select: { id: true, userId: true, date: true, title: true, type: true, status: true, sessionRpe: true, tss: true, durationSec: true, technical: { select: { bestMarkM: true } } },
    }),
    prisma.sessionComment.groupBy({ by: ["sessionId"], where: { athleteId: { in: ids } }, _count: { _all: true } }),
  ]);
  return { links, sessions, counts, now };
}

/** Sesión de una atleta para su entrenadora; `null` si no existe o es de Strava. */
export async function coachSessionDetail(user: CurrentUser, id: string, athleteId: string) {
  const athlete = await resolveAthleteId(user, athleteId, "SESSIONS");
  const session = await prisma.trainingSession.findFirst({
    where: { id, userId: athlete, ...notFromStrava },
    include: {
      technical: { select: { event: true, implementWeightG: true, bestMarkM: true, attempts: { select: { markM: true, isFoul: true }, orderBy: { order: "asc" } } } },
      strength: { include: { sets: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true } } } } } },
    },
  });
  return session ? { athlete, session } : null;
}
