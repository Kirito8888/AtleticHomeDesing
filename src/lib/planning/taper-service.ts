import "server-only";

import { ApiError } from "@/lib/api";
import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

import { taperDays } from "./taper";

/** Días del plan que afinaría (los pendientes antes de la competición) y el % de Mis reglas. */
export async function taperProposal(userId: string, eventId: string) {
  const ev = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, type: "COMPETITION" } });
  if (!ev) throw new ApiError(404, "Competición no encontrada");
  const prefs = await getPrefs(userId);
  const comp = toIsoDay(ev.startAt);
  const rows = await prisma.planDay.findMany({
    where: { userId, date: { not: null }, meso: { status: "ACTIVE" } },
    select: { id: true, title: true, date: true, sessionId: true, taperPct: true, competition: true },
  });
  const done = new Set(
    (await prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", id: { in: rows.flatMap((r) => (r.sessionId ? [r.sessionId] : [])) } }, select: { id: true } })).map((s) => s.id),
  );
  const days = taperDays(
    rows.filter((r) => !r.competition).map((r) => ({ id: r.id, title: r.title, date: toIsoDay(r.date!), taperPct: r.taperPct, done: r.sessionId ? done.has(r.sessionId) : false })),
    comp,
    prefs.taperDays,
  ).sort((a, b) => a.date!.localeCompare(b.date!));
  return { competition: comp, priority: ev.priority, pct: prefs.taperPct, nDays: prefs.taperDays, days, applied: days.length > 0 && days.every((d) => d.taperPct) };
}

/** Aplica o quita el afinamiento: solo guarda el % en esos días; el plan original sigue intacto. */
export async function setTaper(userId: string, eventId: string, apply: boolean) {
  const p = await taperProposal(userId, eventId);
  const { count } = await prisma.planDay.updateMany({ where: { userId, id: { in: p.days.map((d) => d.id) } }, data: { taperPct: apply ? p.pct : null } });
  return { days: count, pct: apply ? p.pct : 0 };
}
