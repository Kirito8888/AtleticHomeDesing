import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import type { PlanBlock } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

import { findRm, isRmLoad, nameKey, parseAnnexRms, type RmEntry } from "./rm";
import { loadVelocityProfile } from "./vbt";

/** RM vigentes (la última por ejercicio). */
export async function currentRms(userId: string): Promise<Array<RmEntry & { id: string; source: string; effectiveFrom: string }>> {
  const rows = await prisma.oneRepMax.findMany({ where: { userId }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const seen = new Set<string>();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.nameKey)) continue;
    seen.add(r.nameKey);
    out.push({ id: r.id, name: r.name, key: r.nameKey, kg: r.kg, perHand: r.perHand, source: r.source, effectiveFrom: toIsoDay(r.effectiveFrom) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function rmHistory(userId: string) {
  return prisma.oneRepMax.findMany({ where: { userId }, orderBy: [{ nameKey: "asc" }, { effectiveFrom: "desc" }] });
}

export async function addRm(userId: string, input: { name: string; kg: number; perHand?: boolean; source?: string; effectiveFrom?: string }) {
  const key = nameKey(input.name);
  if (!key) throw new ApiError(400, "Nombre de ejercicio no válido");
  return prisma.oneRepMax.create({
    data: {
      userId,
      name: input.name.trim(),
      nameKey: key,
      kg: Math.round(input.kg * 100) / 100,
      perHand: input.perHand ?? /por mano/i.test(input.name),
      source: input.source ?? "MANUAL",
      effectiveFrom: input.effectiveFrom ? dateOnly(input.effectiveFrom) : today(),
    },
  });
}

export async function deleteRm(userId: string, id: string) {
  const { count } = await prisma.oneRepMax.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "No encontrado");
}

/** RM del anexo «Mi tabla de RM» de los bloques importados (el más reciente manda). */
export async function rmsFromPlan(userId: string) {
  const mesos = await prisma.planMeso.findMany({ where: { userId, source: "IMPORT" }, orderBy: { startDate: "asc" }, select: { code: true, annexes: true } });
  const found = new Map<string, { name: string; kg: number; perHand: boolean; used: boolean; from: string }>();
  for (const m of mesos) {
    const annexes = m.annexes as Array<{ title: string | null; text: string }>;
    let inRm = false;
    for (const a of annexes) {
      if (a.title && /^Anexo\s/.test(a.title)) inRm = /tabla de RM/i.test(a.title);
      if (!inRm) continue;
      for (const r of parseAnnexRms(`${a.title ?? ""} ${a.text}`)) found.set(nameKey(r.name), { ...r, from: m.code });
    }
  }
  const current = new Map((await currentRms(userId)).map((r) => [r.key, r.kg]));
  return [...found.values()].map((r) => ({ ...r, current: current.get(nameKey(r.name)) ?? null }));
}

export async function importRms(userId: string, items: Array<{ name: string; kg: number; perHand: boolean }>) {
  for (const i of items) await addRm(userId, { ...i, source: "PLAN" });
  return { added: items.length };
}

/** Enlaza un nombre del plan con una fila de la tabla de RM y/o un ejercicio del catálogo. */
export async function setAlias(userId: string, planName: string, link: { rmKey?: string | null; exerciseId?: string | null }) {
  const key = nameKey(planName);
  if (link.exerciseId) {
    const ok = await prisma.exercise.count({ where: { id: link.exerciseId, OR: [{ userId: null }, { userId }] } });
    if (!ok) throw new ApiError(400, "Ejercicio no encontrado");
  }
  const prev = await prisma.exerciseAlias.findUnique({ where: { userId_key: { userId, key } } });
  const data = { rmKey: link.rmKey === undefined ? (prev?.rmKey ?? null) : link.rmKey, exerciseId: link.exerciseId === undefined ? (prev?.exerciseId ?? null) : link.exerciseId };
  return prisma.exerciseAlias.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, ...data }, update: data });
}

/** Todo lo necesario para pasar del plan a kg y a series del formulario. */
export async function rmContext(userId: string) {
  const [rms, aliases, exercises, prefs] = await Promise.all([
    currentRms(userId),
    prisma.exerciseAlias.findMany({ where: { userId } }),
    prisma.exercise.findMany({ where: { OR: [{ userId: null }, { userId }] }, select: { id: true, name: true } }),
    getPrefs(userId),
  ]);
  return {
    rms,
    aliases: new Map(aliases.filter((a) => a.rmKey).map((a) => [a.key, a.rmKey!])),
    exerciseAliases: new Map(aliases.filter((a) => a.exerciseId).map((a) => [a.key, a.exerciseId!])),
    catalog: new Map(exercises.map((e) => [nameKey(e.name), e.id])),
    step: prefs.kgStep,
    prefs,
  };
}

/**
 * Ejercicios del plan activo con %RM que no encuentran su RM, o que no están
 * en el catálogo (para enlazarlos una vez y que se recuerde).
 */
export async function unlinkedPlanExercises(userId: string) {
  const ctx = await rmContext(userId);
  const days = await prisma.planDay.findMany({ where: { userId, sessionId: { not: null } }, select: { content: true } });
  const noRm = new Map<string, string>();
  const noCatalog = new Map<string, string>();
  for (const d of days) {
    for (const b of d.content as PlanBlock[]) {
      if (b.kind !== "table") continue;
      for (const r of b.rows) {
        if (r.ramp) continue;
        const name = r.exercise.replace(/\s*·\s*SERIE DE TEST/, "");
        const key = nameKey(name);
        if (!key) continue;
        // Solo ejercicios con carga (%RM o kg): los de peso corporal o técnica no hace falta enlazarlos.
        const loaded = isRmLoad(r.load) || /\bkg\b/i.test(r.load);
        if (isRmLoad(r.load) && !findRm(name, ctx.rms, ctx.aliases)) noRm.set(key, name);
        if (loaded && /^\d+\s*×\s*\d+/.test(r.sets) && !ctx.exerciseAliases.has(key) && !ctx.catalog.has(key)) noCatalog.set(key, name);
      }
    }
  }
  return { noRm: [...noRm.values()].sort(), noCatalog: [...noCatalog.values()].sort() };
}

/** v1.6 · Contexto de los kg del día: tope (Mis reglas), paso de discos, MVT y perfiles carga-velocidad (90 días). */
export async function autoregContext(userId: string) {
  const prefs = await getPrefs(userId);
  const sets = await prisma.strengthSet.findMany({
    where: { velocityMs: { gt: 0 }, isWarmup: false, strengthSession: { session: { userId, status: "COMPLETED", date: { gte: addDays(today(), -90) } } } },
    select: { exerciseId: true, weightKg: true, velocityMs: true },
  });
  const by = new Map<string, Array<{ kg: number; v: number }>>();
  for (const s of sets) by.set(s.exerciseId, [...(by.get(s.exerciseId) ?? []), { kg: s.weightKg, v: s.velocityMs! }]);
  const profiles: Record<string, { slope: number; intercept: number }> = {};
  for (const [id, pts] of by) {
    const p = loadVelocityProfile(pts, prefs.vbtMvt);
    if (p?.reliable) profiles[id] = { slope: p.slope, intercept: p.intercept };
  }
  return { maxPct: prefs.autoregMaxPct, step: prefs.kgStep, mvt: prefs.vbtMvt, profiles };
}
