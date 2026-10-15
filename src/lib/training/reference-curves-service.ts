import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { type CurrentUser, resolveAthleteId } from "@/lib/auth/session";
import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { type CurveInput, type CurvePoint, overlay, pointsSchema, summarizeOverlay } from "./reference-curves";

/** Curvas que ve la usuaria: las globales (ADMIN) y las que ha dado de alta ella. */
function visible(userId: string): Prisma.ReferenceCurveWhereInput {
  return { OR: [{ global: true }, { createdById: userId }] };
}

export async function listCurves(user: CurrentUser, testKey?: string) {
  const rows = await prisma.referenceCurve.findMany({
    where: { AND: [visible(user.id), testKey ? { testKey } : {}] },
    orderBy: [{ testKey: "asc" }, { year: "desc" }],
  });
  return rows.map((c) => ({ ...c, points: pointsSchema.parse(c.points), mine: c.createdById === user.id }));
}

/** Solo ADMIN (global) y COACH (privada) dan de alta curvas; la atleta no. La atribución es obligatoria (esquema). */
export async function createCurve(user: CurrentUser, input: CurveInput) {
  if (user.role !== "ADMIN" && user.role !== "COACH") throw new ApiError(403, "Solo la administración o una entrenadora pueden añadir curvas");
  return prisma.referenceCurve.create({
    data: {
      createdById: user.id,
      global: user.role === "ADMIN",
      testKey: input.testKey,
      unit: input.unit,
      higherIsBetter: input.higherIsBetter,
      title: input.title,
      sex: input.sex ?? null,
      level: input.level || null,
      discipline: input.discipline ?? null,
      study: input.study,
      authors: input.authors,
      year: input.year,
      citation: input.citation,
      doi: input.doi ?? null,
      sourceUrl: input.sourceUrl ?? null,
      points: input.points as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export async function deleteCurve(user: CurrentUser, id: string) {
  const r = await prisma.referenceCurve.deleteMany({ where: { id, createdById: user.id } });
  if (!r.count) throw new ApiError(404, "Curva no encontrada");
}

/**
 * Compara los resultados del test con la curva. Todo local: no pasa por la IA.
 * Con `athleteId` la entrenadora necesita ámbito LOAD (y `processingRestrictedAt` bloquea, vía resolveAthleteId).
 */
export async function compareCurve(user: CurrentUser, curveId: string, athleteId?: string | null) {
  const curve = await prisma.referenceCurve.findFirst({ where: { id: curveId, ...visible(user.id) } });
  if (!curve) throw new ApiError(404, "Curva no encontrada");
  const target = await resolveAthleteId(user, athleteId, "LOAD");
  const [profile, results] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: target }, select: { birthDate: true, sex: true } }),
    prisma.testResult.findMany({ where: { userId: target, testKey: curve.testKey }, orderBy: { date: "asc" }, select: { date: true, value: true } }),
  ]);
  const points: CurvePoint[] = pointsSchema.parse(curve.points);
  const warnings: string[] = [];
  const birth = profile?.birthDate ? toIsoDay(profile.birthDate) : null;
  if (!birth) warnings.push("Falta la fecha de nacimiento en el perfil: sin ella no se puede situar cada resultado en la curva.");
  if (curve.sex && profile?.sex && curve.sex !== profile.sex) warnings.push("La curva es de otro sexo que el del perfil: tómala solo como orientación.");
  const rows = birth ? overlay(results.map((r) => ({ date: toIsoDay(r.date), value: r.value })), { points, higherIsBetter: curve.higherIsBetter }, birth) : [];
  return {
    curve: {
      id: curve.id,
      title: curve.title,
      testKey: curve.testKey,
      unit: curve.unit,
      higherIsBetter: curve.higherIsBetter,
      level: curve.level,
      sex: curve.sex,
      study: curve.study,
      authors: curve.authors,
      year: curve.year,
      citation: curve.citation,
      doi: curve.doi,
      sourceUrl: curve.sourceUrl,
      points,
    },
    rows,
    summary: summarizeOverlay(rows),
    resultCount: results.length,
    warnings,
  };
}
