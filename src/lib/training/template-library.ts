import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** Cambia los ejercicios de las series según `map` (id del entrenador → id del atleta). Puro. */
export function remapExercises(payload: Record<string, unknown>, map: Map<string, string>): Record<string, unknown> {
  const strength = payload.strength as { sets?: Array<Record<string, unknown>> } | null | undefined;
  if (!strength?.sets) return payload;
  return { ...payload, strength: { ...strength, sets: strength.sets.map((s) => ({ ...s, exerciseId: map.get(String(s.exerciseId)) ?? s.exerciseId })) } };
}

/** Entrenadores con vínculo activo y permiso de sesiones sobre este atleta. */
async function sessionCoaches(athleteId: string) {
  const links = await prisma.coachAthlete.findMany({ where: { athleteId, status: "ACTIVE", scopes: { has: "SESSIONS" } }, select: { coachId: true } });
  return links.map((l) => l.coachId);
}

/** v1.8 · Biblioteca: plantillas que tus entrenadores han compartido. */
export async function sharedFromCoaches(athleteId: string) {
  const coaches = await sessionCoaches(athleteId);
  if (!coaches.length) return [];
  return prisma.sessionTemplate.findMany({
    where: { userId: { in: coaches }, shared: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, user: { select: { name: true } } },
  });
}

export async function setTemplateShared(coachId: string, id: string, shared: boolean) {
  const { count } = await prisma.sessionTemplate.updateMany({ where: { id, userId: coachId }, data: { shared } });
  if (!count) throw new ApiError(404, "Plantilla no encontrada");
}

/**
 * Copia una plantilla compartida a las del atleta. Los ejercicios propios de la entrenadora se
 * crean (o reutilizan por nombre) en el catálogo del atleta; los globales se quedan igual.
 */
export async function copyCoachTemplate(athleteId: string, templateId: string) {
  const coaches = await sessionCoaches(athleteId);
  const tpl = await prisma.sessionTemplate.findFirst({ where: { id: templateId, shared: true, userId: { in: coaches } }, include: { user: { select: { name: true } } } });
  if (!tpl) throw new ApiError(404, "Plantilla no encontrada");
  const payload = tpl.payload as Record<string, unknown>;
  const ids = [...new Set(((payload.strength as { sets?: Array<{ exerciseId?: string }> } | null)?.sets ?? []).map((s) => String(s.exerciseId)))];
  const own = await prisma.exercise.findMany({ where: { id: { in: ids }, userId: tpl.userId } });
  const map = new Map<string, string>();
  for (const e of own) {
    const mine =
      (await prisma.exercise.findFirst({ where: { userId: athleteId, name: e.name }, select: { id: true } })) ??
      (await prisma.exercise.create({
        data: { userId: athleteId, name: e.name, primaryMuscle: e.primaryMuscle, secondaryMuscles: e.secondaryMuscles, pattern: e.pattern, loadType: e.loadType, isUnilateral: e.isUnilateral, bodyweightFactor: e.bodyweightFactor },
        select: { id: true },
      }));
    map.set(e.id, mine.id);
  }
  const name = `${tpl.name} (${tpl.user.name?.split(" ")[0] ?? "entrenadora"})`.slice(0, 80);
  const data = { type: tpl.type, payload: remapExercises(payload, map) as Prisma.InputJsonValue };
  return prisma.sessionTemplate.upsert({ where: { userId_name: { userId: athleteId, name } }, create: { userId: athleteId, name, ...data }, update: data, select: { id: true, name: true } });
}
