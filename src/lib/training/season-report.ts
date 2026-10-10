import "server-only";

import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export type SeasonMonth = { month: string; sessions: number; tss: number };

/** Sesiones y TSS por mes del año (los 12, aunque estén vacíos). Puro. */
export function monthlyLoad(rows: Array<{ date: string; tss: number | null }>, year: number): SeasonMonth[] {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, sessions: 0, tss: 0 }));
  for (const r of rows) {
    const m = out.find((o) => r.date.startsWith(o.month));
    if (!m) continue;
    m.sessions++;
    m.tss += r.tss ?? 0;
  }
  return out.map((m) => ({ ...m, tss: Math.round(m.tss) }));
}

/** Mejor marca del año por prueba (lanzamientos/saltos: la mayor; carreras: la menor). Puro. */
export function bestOfYear<T extends { key: string; value: number; higherIsBetter: boolean }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const b = best.get(r.key);
    if (!b || (r.higherIsBetter ? r.value > b.value : r.value < b.value)) best.set(r.key, r);
  }
  return [...best.values()];
}

/**
 * v1.8 · Informe de temporada imprimible: marcas, carga, competiciones, molestias y balance
 * deportivo del año. No incluye salud de la mujer ni nada cifrado.
 */
export async function seasonReport(userId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const [sessions, records, comps, injuries, txs] = await Promise.all([
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: from, lte: to } }, select: { date: true, tss: true } }),
    prisma.personalRecord.findMany({
      where: { userId, isEstimated: false, kind: { in: ["TECHNICAL_MARK", "TRACK_TIME"] }, achievedOn: { gte: from, lte: to } },
      select: { kind: true, technicalEvent: true, implementWeightG: true, trackDistanceM: true, value: true, achievedOn: true, isCompetition: true },
    }),
    prisma.calendarEvent.findMany({ where: { userId, type: "COMPETITION", startAt: { gte: from, lte: new Date(Date.UTC(year, 11, 31, 23, 59)) } }, orderBy: { startAt: "asc" }, select: { title: true, startAt: true, location: true, priority: true } }),
    prisma.injury.findMany({ where: { userId, startedOn: { lte: to }, OR: [{ resolvedOn: null }, { resolvedOn: { gte: from } }] }, orderBy: { startedOn: "asc" }, select: { area: true, side: true, pain: true, startedOn: true, resolvedOn: true, limitsTraining: true } }),
    prisma.financialTransaction.findMany({
      where: { userId, sport: true, kind: { in: ["INCOME", "EXPENSE"] }, date: { gte: from, lte: to } },
      select: { date: true, kind: true, postings: { select: { amountCents: true, account: { select: { type: true } } } } },
    }),
  ]);
  const marks = bestOfYear(
    records.map((r) => ({
      key: r.kind === "TECHNICAL_MARK" ? `${r.technicalEvent}:${r.implementWeightG ?? ""}` : `track:${r.trackDistanceM}`,
      kind: r.kind,
      technicalEvent: r.technicalEvent,
      implementWeightG: r.implementWeightG,
      trackDistanceM: r.trackDistanceM,
      value: r.value,
      date: toIsoDay(r.achievedOn),
      isCompetition: r.isCompetition,
      higherIsBetter: r.kind === "TECHNICAL_MARK",
    })),
  );
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    const cents = Math.abs(t.postings.filter((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY").reduce((a, p) => a + p.amountCents, 0));
    if (t.kind === "INCOME") income += cents;
    else expense += cents;
  }
  return {
    year,
    load: monthlyLoad(sessions.map((s) => ({ date: toIsoDay(s.date), tss: s.tss })), year),
    marks,
    competitions: comps.map((c) => ({ ...c, date: toIsoDay(c.startAt) })),
    injuries: injuries.map((i) => ({ ...i, startedOn: toIsoDay(i.startedOn), resolvedOn: i.resolvedOn ? toIsoDay(i.resolvedOn) : null })),
    money: { incomeCents: income, expenseCents: expense },
  };
}
