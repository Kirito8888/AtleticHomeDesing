import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { mergeGrants, type CurrentUser, type Grant } from "@/lib/auth/session";
import { addDays, dateOnly, isoDate, today, toIsoDay } from "@/lib/dates";
import { createManualDraftFromDays, planSourceDays, templateSourceDays, type DraftSourceDay } from "@/lib/planning/manual-plan";
import { taperProposal } from "@/lib/planning/taper-service";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { THROWS } from "@/lib/training/move-service";

import { filterEligible, plannedTss, scenarios, type GrantInfo, type Rejection, type Scenario } from "./what-if";

/**
 * v2.0 B · Planificar varios atletas. Copia una semana tipo o un plan propio de la entrenadora a N atletas
 * como BORRADOR en cada una (la atleta lo activa). La previsualización solo lee; `apply` exige `confirm: true`.
 * Acceso: vínculo 1:1 activo o club (staff ADMIN/COACH + atleta ACTIVE), ámbito PLANNING y canPlan; la limitación
 * del tratamiento (art. 18) bloquea siempre. Aquí el ADMIN global no se salta nada: solo cuentan los permisos reales.
 */
const source = z.discriminatedUnion("kind", [z.object({ kind: z.literal("template"), id: z.string().max(40) }), z.object({ kind: z.literal("plan"), code: z.string().max(20) })]);
const base = { source, start: isoDate, athleteIds: z.array(z.string().max(40)).min(1).max(30), rpe: z.number().min(1).max(10).default(6) };
export const previewSchema = z.object(base);
export const applySchema = z.object({ ...base, confirm: z.literal(true, { message: "Falta la confirmación" }) });

const isStaff = (u: CurrentUser) => u.role === "COACH" || u.role === "ADMIN";

async function loadGrants(coach: CurrentUser, ids: string[]): Promise<Map<string, GrantInfo>> {
  if (!isStaff(coach)) throw new ApiError(403, "Solo entrenadoras");
  const [links, members, users] = await Promise.all([
    prisma.coachAthlete.findMany({ where: { coachId: coach.id, athleteId: { in: ids }, status: "ACTIVE" }, select: { athleteId: true, scopes: true, canPlan: true } }),
    prisma.orgMember.findMany({
      where: { userId: { in: ids }, role: "ATHLETE", status: "ACTIVE", org: { members: { some: { userId: coach.id, role: { in: ["ADMIN", "COACH"] }, status: "ACTIVE" } } } },
      select: { userId: true, scopes: true, canPlan: true },
    }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, processingRestrictedAt: true } }),
  ]);
  const by = new Map<string, Grant[]>();
  for (const l of links) by.set(l.athleteId, [...(by.get(l.athleteId) ?? []), l]);
  for (const m of members) by.set(m.userId, [...(by.get(m.userId) ?? []), m]);
  const restricted = new Map(users.map((u) => [u.id, Boolean(u.processingRestrictedAt)]));
  const out = new Map<string, GrantInfo>();
  for (const id of ids) {
    const g = by.get(id);
    out.set(id, g?.length ? { ...mergeGrants(g), restricted: restricted.get(id) ?? false, linked: true } : { scopes: [], canPlan: false, restricted: restricted.get(id) ?? false, linked: false });
  }
  return out;
}

/** Atletas de la entrenadora (vínculo o club) con si se les puede planificar y por qué no. Más sus semanas tipo y planes propios. */
export async function multiPlanOverview(coach: CurrentUser) {
  if (!isStaff(coach)) throw new ApiError(403, "Solo entrenadoras");
  const [links, members, templates, plans] = await Promise.all([
    prisma.coachAthlete.findMany({ where: { coachId: coach.id, status: "ACTIVE" }, select: { athlete: { select: { id: true, name: true, email: true } } } }),
    prisma.orgMember.findMany({
      where: { role: "ATHLETE", status: "ACTIVE", org: { members: { some: { userId: coach.id, role: { in: ["ADMIN", "COACH"] }, status: "ACTIVE" } } } },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.weekTemplate.findMany({ where: { userId: coach.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.planMeso.findMany({ where: { userId: coach.id, source: "MANUAL" }, select: { code: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const people = new Map([...links.map((l) => l.athlete), ...members.map((m) => m.user)].filter((p) => p.id !== coach.id).map((p) => [p.id, p]));
  const ids = [...people.keys()];
  const grants = await loadGrants(coach, ids);
  const { rejected } = filterEligible(ids, grants);
  const why = new Map(rejected.map((r) => [r.id, r.reason]));
  const athletes = ids
    .map((id) => ({ id, name: people.get(id)!.name ?? people.get(id)!.email, eligible: !why.has(id), reason: why.get(id) ?? null, canSimulate: grants.get(id)!.scopes.includes("LOAD") }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  return { athletes, templates, plans };
}

async function resolveSource(coach: CurrentUser, s: z.infer<typeof source>, start: string): Promise<{ name: string; days: DraftSourceDay[] }> {
  if (s.kind === "template") {
    const t = await prisma.weekTemplate.findFirst({ where: { id: s.id, userId: coach.id }, select: { name: true } });
    return { name: t?.name ?? "Semana tipo", days: await templateSourceDays(coach.id, s.id, start) };
  }
  const p = await prisma.planMeso.findUnique({ where: { userId_code: { userId: coach.id, code: s.code } }, select: { name: true } });
  return { name: p?.name ?? s.code, days: await planSourceDays(coach.id, s.code, start) };
}

export type AthletePreview = {
  id: string;
  name: string;
  days: Array<{ date: string; title: string; tss: number }>;
  clashDates: string[];
  simulation: { scenarios: Array<Pick<Scenario, "id" | "label" | "notes" | "summary"> & { series: Array<{ date: string; ctl: number; atl: number; tsb: number }> }>; competition: string | null } | null;
  simulationNote: string | null;
};

/** Solo lecturas: nada se escribe (ni siquiera `DailyLoad`). */
export async function previewAssignment(coach: CurrentUser, input: z.infer<typeof previewSchema>) {
  const grants = await loadGrants(coach, [...new Set(input.athleteIds)]);
  const { ok, rejected } = filterEligible(input.athleteIds, grants);
  if (!ok.length) return { source: null, athletes: [] as AthletePreview[], rejected };
  const src = await resolveSource(coach, input.source, input.start);
  if (!src.days.length) throw new ApiError(422, "No hay días que copiar a partir de esa fecha");
  const todayIso = toIsoDay(today());
  const lastDraft = src.days.at(-1)!.date;
  const people = await prisma.user.findMany({ where: { id: { in: ok } }, select: { id: true, name: true, email: true } });
  const athletes: AthletePreview[] = [];
  for (const p of people) {
    const draft = src.days.map((d) => ({ date: d.date, title: d.title, tss: plannedTss({ tss: null, durationSec: d.durationMin ? d.durationMin * 60 : null }, input.rpe), isThrow: /jabalina|lanzamiento|javelin/i.test(d.title) }));
    const row: AthletePreview = { id: p.id, name: p.name ?? p.email, days: draft.map(({ date, title, tss }) => ({ date, title, tss: Math.round(tss) })), clashDates: [], simulation: null, simulationNote: null };
    athletes.push(row);
    if (!grants.get(p.id)!.scopes.includes("LOAD")) {
      row.simulationNote = "Sin permiso de carga: se puede copiar, pero no simular";
      continue;
    }
    const to = toIsoDay(addDays(dateOnly(lastDraft < todayIso ? todayIso : lastDraft), 14));
    const [seed, profile, prefs, planned, comp] = await Promise.all([
      prisma.dailyLoad.findFirst({ where: { userId: p.id }, orderBy: { date: "desc" } }),
      prisma.athleteProfile.findUnique({ where: { userId: p.id }, select: { ctlTimeConstant: true, atlTimeConstant: true } }),
      getPrefs(p.id),
      prisma.trainingSession.findMany({ where: { userId: p.id, status: "PLANNED", date: { gte: dateOnly(todayIso), lte: dateOnly(to) } }, select: { date: true, title: true, tss: true, durationSec: true, technical: { select: { event: true } } } }),
      prisma.calendarEvent.findFirst({ where: { userId: p.id, type: "COMPETITION", startAt: { gte: dateOnly(todayIso) } }, orderBy: { startAt: "asc" }, select: { id: true } }),
    ]);
    const taper = comp ? await taperProposal(p.id, comp.id) : null;
    const busy = new Set(planned.map((s) => toIsoDay(s.date)));
    row.clashDates = draft.filter((d) => busy.has(d.date)).map((d) => d.date);
    const list = scenarios({
      seed: seed ? { ctl: seed.ctl, atl: seed.atl, date: toIsoDay(seed.date) } : undefined,
      from: todayIso,
      to,
      planned: planned.map((s) => ({ date: toIsoDay(s.date), tss: plannedTss(s, input.rpe) })),
      draft,
      throwDates: planned.filter((s) => (s.technical && THROWS.includes(s.technical.event)) || /jabalina|lanzamiento|javelin/i.test(s.title ?? "")).map((s) => toIsoDay(s.date)),
      minHours: prefs.throwMinHours,
      taper: taper ? { from: toIsoDay(addDays(dateOnly(taper.competition), -taper.nDays)), competition: taper.competition, pct: taper.pct } : undefined,
      ctlDays: profile?.ctlTimeConstant ?? 42,
      atlDays: profile?.atlTimeConstant ?? 7,
    });
    row.simulation = {
      competition: taper?.competition ?? null,
      scenarios: list.map((s) => ({ id: s.id, label: s.label, notes: s.notes, summary: s.summary, series: s.series.map(({ date, ctl, atl, tsb }) => ({ date, ctl, atl, tsb })) })),
    };
  }
  return { source: { name: src.name, kind: input.source.kind }, athletes, rejected };
}

/** Escribe un borrador por atleta apta. Las no aptas se devuelven con su motivo y no se tocan. */
export async function applyAssignment(coach: CurrentUser, input: z.infer<typeof applySchema>) {
  const grants = await loadGrants(coach, [...new Set(input.athleteIds)]);
  const { ok, rejected } = filterEligible(input.athleteIds, grants);
  if (!ok.length) return { created: [] as Array<{ athleteId: string; code: string; days: number }>, rejected };
  const [src, me] = await Promise.all([resolveSource(coach, input.source, input.start), prisma.user.findUnique({ where: { id: coach.id }, select: { name: true } })]);
  if (!src.days.length) throw new ApiError(422, "No hay días que copiar a partir de esa fecha");
  const created: Array<{ athleteId: string; code: string; days: number }> = [];
  const failed: Rejection[] = [];
  for (const athleteId of ok) {
    try {
      const m = await createManualDraftFromDays(athleteId, { name: `${src.name} · de ${me?.name ?? "tu entrenadora"}`, days: src.days, meta: { assignedById: coach.id, assignedFrom: input.source.kind === "template" ? `template:${input.source.id}` : `plan:${input.source.code}` } });
      created.push({ athleteId, code: m.code, days: src.days.length });
    } catch {
      failed.push({ id: athleteId, reason: "No se pudo crear el borrador" });
    }
  }
  return { created, rejected: [...rejected, ...failed] };
}
