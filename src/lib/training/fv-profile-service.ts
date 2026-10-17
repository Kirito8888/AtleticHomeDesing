import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { computeFvProfile, type FvSeriesInput, fvLoadSchema } from "./fv-profile";

const loadsSchema = fvLoadSchema.array();

/** Guarda la serie (solo entradas) si el perfil se puede calcular; si no, 400 con el motivo. */
export async function createFvSeries(userId: string, input: FvSeriesInput) {
  const r = computeFvProfile(input);
  if (!r.ok) throw new ApiError(400, r.error);
  const row = await prisma.fvSeries.create({
    data: { userId, date: dateOnly(input.date), bodyMassKg: input.bodyMassKg, hpoCm: input.hpoCm, loads: input.loads },
    select: { id: true },
  });
  return { id: row.id, profile: r.profile, warnings: r.warnings };
}

/** Histórico de la usuaria, lo más reciente primero, con el perfil recalculado (una sola fuente de verdad). */
export async function listFvSeries(userId: string) {
  const rows = await prisma.fvSeries.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 });
  return rows.map((s) => {
    const loads = loadsSchema.parse(s.loads);
    const r = computeFvProfile({ bodyMassKg: s.bodyMassKg, hpoCm: s.hpoCm, loads });
    return { id: s.id, date: toIsoDay(s.date), bodyMassKg: s.bodyMassKg, hpoCm: s.hpoCm, loads, result: r };
  });
}

export async function deleteFvSeries(userId: string, id: string) {
  const { count } = await prisma.fvSeries.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Serie no encontrada");
}
