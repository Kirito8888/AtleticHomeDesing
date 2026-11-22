import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { dateOnly, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { assertNotRestricted } from "@/lib/privacy/service";
import { ensureLoadsUpToDate, refreshReadinessRange } from "@/lib/training/service";

import { decide, HEALTH_KEYS, type HealthDay, type HealthKey, KEY_OF, METRIC_OF, sameValue } from "./health-sync";

type Sync = Partial<Record<HealthKey, number>>;

export type IngestResult = {
  days: number;
  saved: number;
  unchanged: number;
  conflicts: number;
  detail: Array<{ date: string; saved: HealthKey[]; unchanged: HealthKey[]; conflicts: HealthKey[] }>;
};

/**
 * Guarda lo que manda el Atajo de Apple Salud. Por día y métrica: vacío → se guarda; igual (con tolerancia) → se
 * conserva el existente; distinto de lo anotado → NO se sobrescribe y se abre un conflicto. Idempotente.
 * Después recalcula el readiness de los días afectados.
 */
export async function ingestHealthDays(userId: string, days: HealthDay[]): Promise<IngestResult> {
  const dates = days.map((d) => dateOnly(d.date));
  const [rows, open] = await Promise.all([
    prisma.recoveryMetrics.findMany({ where: { userId, date: { in: dates } } }),
    prisma.healthSyncConflict.findMany({ where: { userId, date: { in: dates } } }),
  ]);
  const rowBy = new Map(rows.map((r) => [toIsoDay(r.date), r]));
  const conflictBy = new Map(open.map((c) => [`${toIsoDay(c.date)}|${c.metric}`, c]));
  const result: IngestResult = { days: days.length, saved: 0, unchanged: 0, conflicts: 0, detail: [] };
  const touched: Date[] = [];
  let weightDay: { date: string; kg: number } | null = null;

  for (const d of days) {
    const date = dateOnly(d.date);
    const row = rowBy.get(d.date);
    const last = (row?.healthSync ?? {}) as Sync;
    const patch: Partial<Record<HealthKey, number>> = {};
    const sync: Sync = { ...last };
    const det = { date: d.date, saved: [] as HealthKey[], unchanged: [] as HealthKey[], conflicts: [] as HealthKey[] };

    for (const key of HEALTH_KEYS) {
      const incoming = d[key];
      if (incoming == null) continue;
      const current = (row?.[key] as number | null | undefined) ?? null;
      const decision = decide(key, current, incoming, last[key]);
      const ck = `${d.date}|${METRIC_OF[key]}`;
      const prior = conflictBy.get(ck);
      if (decision === "write") {
        patch[key] = incoming;
        sync[key] = incoming;
        det.saved.push(key);
        if (prior?.status === "PENDING") await prisma.healthSyncConflict.delete({ where: { id: prior.id } });
      } else if (decision === "keep") {
        sync[key] = incoming;
        det.unchanged.push(key);
        // Lo anotado ya coincide con Apple: el aviso abierto sobra
        if (prior?.status === "PENDING") await prisma.healthSyncConflict.delete({ where: { id: prior.id } });
      } else {
        det.conflicts.push(key);
        // Resuelto con el mismo valor entrante: no se reabre; con otro valor, sí (nuevo dato de Apple)
        const same = prior && sameValue(key, prior.incomingValue, incoming) && sameValue(key, prior.currentValue, current ?? 0);
        if (!(prior && prior.status !== "PENDING" && same)) {
          await prisma.healthSyncConflict.upsert({
            where: { userId_date_metric: { userId, date, metric: METRIC_OF[key] } },
            create: { userId, date, metric: METRIC_OF[key], currentValue: current as number, incomingValue: incoming },
            update: { currentValue: current as number, incomingValue: incoming, status: "PENDING", resolvedAt: null, receivedAt: new Date() },
          });
        } else det.conflicts.pop();
      }
    }

    if (Object.keys(patch).length || JSON.stringify(sync) !== JSON.stringify(last)) {
      await prisma.recoveryMetrics.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, ...patch, healthSync: sync as Prisma.InputJsonValue },
        update: { ...patch, healthSync: sync as Prisma.InputJsonValue },
      });
    }
    if (Object.keys(patch).length) touched.push(date);
    if (patch.bodyWeightKg != null && (!weightDay || d.date > weightDay.date)) weightDay = { date: d.date, kg: patch.bodyWeightKg };
    result.saved += det.saved.length;
    result.unchanged += det.unchanged.length;
    result.conflicts += det.conflicts.length;
    result.detail.push(det);
  }

  if (weightDay) await syncProfileWeight(userId, weightDay.date, weightDay.kg);
  if (touched.length) await recomputeFrom(userId, touched);
  return result;
}

/** El peso del perfil solo sigue al registro más reciente con peso (un envío atrasado no lo pisa). */
async function syncProfileWeight(userId: string, date: string, kg: number) {
  const newer = await prisma.recoveryMetrics.findFirst({ where: { userId, bodyWeightKg: { not: null }, date: { gt: dateOnly(date) } }, select: { id: true } });
  if (newer) return;
  await prisma.athleteProfile.upsert({ where: { userId }, create: { userId, bodyWeightKg: kg }, update: { bodyWeightKg: kg } });
}

async function recomputeFrom(userId: string, dates: Date[]) {
  await ensureLoadsUpToDate(userId);
  const from = new Date(Math.min(...dates.map((d) => d.getTime())));
  // La línea base de los días siguientes también cambia: se recalcula hasta hoy
  await refreshReadinessRange(userId, from, today());
}

export async function listConflicts(userId: string) {
  const rows = await prisma.healthSyncConflict.findMany({ where: { userId, status: "PENDING" }, orderBy: [{ date: "desc" }, { metric: "asc" }] });
  return rows.map((c) => ({ id: c.id, date: toIsoDay(c.date), metric: c.metric, currentValue: c.currentValue, incomingValue: c.incomingValue }));
}

/** Elige con qué quedarse. 404 si no es tuyo, 409 si ya estaba resuelto. */
export async function resolveConflict(userId: string, id: string, keep: "current" | "incoming") {
  await assertNotRestricted(userId, "resolver este aviso");
  const c = await prisma.healthSyncConflict.findFirst({ where: { id, userId } });
  if (!c) throw new ApiError(404, "Aviso no encontrado");
  if (c.status !== "PENDING") throw new ApiError(409, "Este aviso ya estaba resuelto");
  const key = KEY_OF[c.metric];
  await prisma.$transaction(async (tx) => {
    // Solo se resuelve una vez, aunque lleguen dos clics a la vez
    const { count } = await tx.healthSyncConflict.updateMany({
      where: { id, userId, status: "PENDING" },
      data: { status: keep === "incoming" ? "TOOK_INCOMING" : "KEPT_CURRENT", resolvedAt: new Date() },
    });
    if (!count) throw new ApiError(409, "Este aviso ya estaba resuelto");
    if (keep === "incoming") {
      const row = await tx.recoveryMetrics.findUnique({ where: { userId_date: { userId, date: c.date } } });
      const sync = { ...((row?.healthSync ?? {}) as Sync), [key]: c.incomingValue };
      await tx.recoveryMetrics.upsert({
        where: { userId_date: { userId, date: c.date } },
        create: { userId, date: c.date, [key]: c.incomingValue, healthSync: sync as Prisma.InputJsonValue },
        update: { [key]: c.incomingValue, healthSync: sync as Prisma.InputJsonValue },
      });
    }
  });
  if (keep === "incoming") {
    if (key === "bodyWeightKg") await syncProfileWeight(userId, toIsoDay(c.date), c.incomingValue);
    await recomputeFrom(userId, [c.date]);
  }
  return { id, status: keep === "incoming" ? "TOOK_INCOMING" : "KEPT_CURRENT" };
}

