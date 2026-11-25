import "server-only";

import { ApiError } from "@/lib/api";
import { toIsoDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { notFromStrava } from "@/lib/strava/policy";
import { managedUpdateSchema, planState, type PlanState } from "./rules";

export interface PortfolioRow {
  id: string;
  kind: "ficha" | "cuenta";
  name: string;
  group: string | null;
  label: string | null;
  discipline: string | null;
  archived: boolean;
  planEnd: string | null;
  plan: PlanState | null;
  planDays: number | null;
  lastSession: string | null;
  href: string;
}

const isStaff = (u: { role: string }) => u.role === "COACH" || u.role === "ADMIN";

/**
 * Cartera de la entrenadora: sus fichas (sin cuenta) y las atletas con cuenta que le han dado acceso, en una sola lista.
 * De una cuenta solo se calcula lo que su ámbito permite (plan con PLANNING, última sesión con SESSIONS, sin orígenes privados).
 */
export async function portfolio(coach: { id: string; role: string }): Promise<PortfolioRow[]> {
  if (!isStaff(coach)) throw new ApiError(403, "Solo entrenadoras");
  const [fichas, links] = await Promise.all([
    prisma.managedAthlete.findMany({ where: { coachId: coach.id }, select: { userId: true, alias: true, category: true, discipline: true, group: true, archivedAt: true, birthYear: true } }),
    prisma.coachAthlete.findMany({ where: { coachId: coach.id, status: "ACTIVE" }, select: { scopes: true, athlete: { select: { id: true, name: true, email: true, processingRestrictedAt: true } } } }),
  ]);
  const accounts = links.filter((l) => !l.athlete.processingRestrictedAt);
  const planIds = [...fichas.map((f) => f.userId), ...accounts.filter((l) => l.scopes.includes("PLANNING")).map((l) => l.athlete.id)];
  const sessIds = [...fichas.map((f) => f.userId), ...accounts.filter((l) => l.scopes.includes("SESSIONS")).map((l) => l.athlete.id)];
  const [plans, last] = await Promise.all([
    planIds.length ? prisma.planDay.groupBy({ by: ["userId"], where: { userId: { in: planIds }, date: { not: null } }, _max: { date: true } }) : [],
    sessIds.length ? prisma.trainingSession.groupBy({ by: ["userId"], where: { userId: { in: sessIds }, status: "COMPLETED", ...notFromStrava }, _max: { date: true } }) : [],
  ]);
  const planEnd = new Map(plans.map((p) => [p.userId, p._max.date ? toIsoDay(p._max.date) : null]));
  const lastS = new Map(last.map((p) => [p.userId, p._max.date ? toIsoDay(p._max.date) : null]));
  const todayIso = toIsoDay(today());
  const row = (r: Omit<PortfolioRow, "planEnd" | "plan" | "planDays" | "lastSession"> & { canPlan: boolean; canSess: boolean }): PortfolioRow => {
    const end = r.canPlan ? (planEnd.get(r.id) ?? null) : null;
    const ps = r.canPlan ? planState(end, todayIso) : null;
    return { id: r.id, kind: r.kind, name: r.name, group: r.group, label: r.label, discipline: r.discipline, archived: r.archived, href: r.href, planEnd: end, plan: ps?.state ?? null, planDays: ps?.days ?? null, lastSession: r.canSess ? (lastS.get(r.id) ?? null) : null };
  };
  const out: PortfolioRow[] = [
    ...fichas.map((f) => row({ id: f.userId, kind: "ficha", name: f.alias, group: f.group, label: f.category ?? (f.birthYear ? String(f.birthYear) : null), discipline: f.discipline, archived: Boolean(f.archivedAt), href: `/coach/athletes/${f.userId}`, canPlan: true, canSess: true })),
    ...accounts.map((l) => row({ id: l.athlete.id, kind: "cuenta", name: l.athlete.name ?? l.athlete.email, group: null, label: null, discipline: null, archived: false, href: "/coach", canPlan: l.scopes.includes("PLANNING"), canSess: l.scopes.includes("SESSIONS") })),
  ];
  return out.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "es"));
}

/** Ficha de la entrenadora (404 si no existe, es de otra o no es una ficha). */
export async function ownedFicha(coach: { id: string }, userId: string) {
  const f = await prisma.managedAthlete.findFirst({ where: { userId, coachId: coach.id } });
  if (!f) throw new ApiError(404, "Ficha no encontrada");
  return f;
}

/** Edita o archiva/reactiva una ficha propia. Los datos se validan con el mismo esquema `strict` (sin nombre real, email ni teléfono). */
export async function updateFicha(coach: { id: string; role: string }, userId: string, raw: unknown) {
  if (!isStaff(coach)) throw new ApiError(403, "Solo entrenadoras");
  const parsed = managedUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Datos no válidos");
  const f = await ownedFicha(coach, userId);
  const { archived, alias, ...rest } = parsed.data;
  const data = { ...rest, ...(alias ? { alias } : {}), ...(archived === undefined ? {} : { archivedAt: archived ? (f.archivedAt ?? new Date()) : null }) };
  return prisma.$transaction(async (tx) => {
    const u = await tx.managedAthlete.update({ where: { userId }, data });
    if (alias) await tx.user.update({ where: { id: userId }, data: { name: alias } });
    return u;
  });
}
