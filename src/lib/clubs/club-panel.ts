import "server-only";

import type { CoachScope } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/session";
import { resolveAthleteId } from "@/lib/auth/session";
import { compareAthletes } from "@/lib/coach/compare";
import { addDays, toIsoDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { rulesToday } from "@/lib/rules/rules-service";
import { notFromStrava } from "@/lib/strava/policy";

import { requireOrgRole } from "./service";

/** Id de la atleta si el usuario puede leer ese ámbito (RGPD art. 18 incluido); si no, null: el dato se oculta. */
async function canRead(user: CurrentUser, athleteId: string, scope: CoachScope) {
  try {
    await resolveAthleteId(user, athleteId, scope);
    return true;
  } catch {
    return false;
  }
}

/** Panel del club para su staff (ADMIN/COACH): cada dato de cada atleta pasa por resolveAthleteId. */
export async function loadClubPanel(user: CurrentUser, orgId: string) {
  await requireOrgRole(user.id, orgId, ["ADMIN", "COACH"]);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } } },
  });
  const now = today();
  const todayIso = toIsoDay(now);
  const athletes = org.members.filter((m) => m.role === "ATHLETE" && m.status === "ACTIVE");

  const rows = await Promise.all(
    athletes.map(async (m) => {
      const id = m.userId;
      const [sessions, recovery, planning] = await Promise.all([
        canRead(user, id, "SESSIONS"),
        canRead(user, id, "RECOVERY"),
        canRead(user, id, "PLANNING"),
      ]);
      const load = await canRead(user, id, "LOAD");
      const name = m.user.name ?? m.user.email;
      const sess =
        sessions || planning || load
          ? await prisma.trainingSession.findMany({
              where: { userId: id, ...notFromStrava, date: { gte: addDays(now, -30), lte: addDays(now, 14) } },
              orderBy: { date: "asc" },
              select: { id: true, date: true, title: true, type: true, status: true, sessionRpe: true, durationSec: true, technical: { select: { bestMarkM: true } } },
            })
          : [];
      const alerts = recovery ? await rulesToday(id, todayIso).catch(() => []) : [];
      return { id, name, scopes: [sessions && "SESSIONS", load && "LOAD"].filter(Boolean) as string[], sess, alerts, recovery, planning, sessions };
    }),
  );

  const compare = compareAthletes(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      scopes: r.scopes,
      sessions: r.sess.filter((s) => s.date <= now).map((s) => ({ date: toIsoDay(s.date), status: s.status, sessionRpe: s.sessionRpe, durationSec: s.durationSec, bestMarkM: s.technical?.bestMarkM ?? null })),
    })),
    todayIso,
  );
  const alerts = rows.flatMap((r) => r.alerts.map((a) => ({ athlete: r.name, ...a })));
  // Calendario colectivo: de −7 a +14 días, solo atletas que concedieron planificación
  const calendar = rows
    .filter((r) => r.planning)
    .flatMap((r) => r.sess.filter((s) => s.date >= addDays(now, -7)).map((s) => ({ id: s.id, athlete: r.name, day: toIsoDay(s.date), title: s.title, type: s.type, status: s.status })))
    .sort((a, b) => a.day.localeCompare(b.day));
  const hidden = rows.filter((r) => !r.recovery || !r.planning || !r.sessions).length;
  return { org, athletes, compare, alerts, calendar, hidden, todayIso, isAdmin: org.members.some((m) => m.userId === user.id && m.role === "ADMIN") };
}
