import "server-only";

import type { CoachScope } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/session";
import { readableScopes } from "@/lib/auth/session";
import { compareAthletes } from "@/lib/coach/compare";
import { addDays, toIsoDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { Alert } from "@/lib/rules/engine";
import { rulesTodayMany } from "@/lib/rules/rules-service";
import { notFromStrava } from "@/lib/strava/policy";

import { requireOrgRole } from "./service";

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

  // Permisos, sesiones y avisos de todas las atletas de una vez: el nº de consultas no depende del nº de atletas
  const scopes = await readableScopes(user, athletes.map((m) => m.userId));
  const can = (id: string, scope: CoachScope) => scopes.get(id)?.has(scope) ?? false;
  const withSessions = athletes.filter((m) => can(m.userId, "SESSIONS") || can(m.userId, "PLANNING") || can(m.userId, "LOAD")).map((m) => m.userId);
  const withRecovery = athletes.filter((m) => can(m.userId, "RECOVERY")).map((m) => m.userId);
  const [allSessions, allAlerts] = await Promise.all([
    withSessions.length
      ? prisma.trainingSession.findMany({
          where: { userId: { in: withSessions }, ...notFromStrava, date: { gte: addDays(now, -30), lte: addDays(now, 14) } },
          orderBy: { date: "asc" },
          select: { id: true, userId: true, date: true, title: true, type: true, status: true, sessionRpe: true, durationSec: true, technical: { select: { bestMarkM: true } } },
        })
      : [],
    rulesTodayMany(withRecovery, todayIso).catch(() => new Map<string, Alert[]>()),
  ]);

  const rows = athletes.map((m) => {
    const id = m.userId;
    const sessions = can(id, "SESSIONS");
    const load = can(id, "LOAD");
    const name = m.user.name ?? m.user.email;
    const sess = allSessions.filter((s) => s.userId === id);
    return { id, name, scopes: [sessions && "SESSIONS", load && "LOAD"].filter(Boolean) as string[], sess, alerts: allAlerts.get(id) ?? [], recovery: can(id, "RECOVERY"), planning: can(id, "PLANNING"), sessions };
  });

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
