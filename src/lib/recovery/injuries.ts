import "server-only";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { dateOnly, isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { BODY_AREA_LABEL } from "@/lib/recovery/injury-rules";

const areas = Object.keys(BODY_AREA_LABEL) as [keyof typeof BODY_AREA_LABEL, ...Array<keyof typeof BODY_AREA_LABEL>];

export const injurySchema = z.object({
  area: z.enum(areas),
  side: z.enum(["LEFT", "RIGHT", "BOTH"]).nullish(),
  pain: z.number().int().min(0).max(10),
  limitsTraining: z.boolean().default(false),
  startedOn: isoDate,
  notes: z.string().trim().max(1000).nullish(),
});

export const injuryUpdateSchema = injurySchema.partial().extend({
  /** Fecha de alta; null = vuelve a estar activa. */
  resolvedOn: isoDate.nullish(),
});

export function listInjuries(userId: string) {
  return prisma.injury.findMany({
    where: { userId },
    orderBy: [{ resolvedOn: { sort: "desc", nulls: "first" } }, { startedOn: "desc" }],
    take: 50,
  });
}

export function activeInjuries(userId: string) {
  return prisma.injury.findMany({ where: { userId, resolvedOn: null }, orderBy: { pain: "desc" } });
}

export function createInjury(userId: string, input: z.infer<typeof injurySchema>) {
  return prisma.injury.create({
    data: { ...input, userId, side: input.side ?? null, notes: input.notes ?? null, startedOn: dateOnly(input.startedOn) },
  });
}

export async function updateInjury(userId: string, id: string, input: z.infer<typeof injuryUpdateSchema>) {
  const found = await prisma.injury.findFirst({ where: { id, userId }, select: { startedOn: true } });
  if (!found) throw new ApiError(404, "Lesión no encontrada");
  const resolvedOn = input.resolvedOn === undefined ? undefined : input.resolvedOn ? dateOnly(input.resolvedOn) : null;
  const startedOn = input.startedOn ? dateOnly(input.startedOn) : found.startedOn;
  if (resolvedOn && resolvedOn < startedOn) throw new ApiError(400, "La fecha de alta no puede ser anterior al inicio");
  return prisma.injury.update({
    where: { id },
    data: { ...input, startedOn: input.startedOn ? startedOn : undefined, resolvedOn },
  });
}

export async function deleteInjury(userId: string, id: string) {
  const { count } = await prisma.injury.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Lesión no encontrada");
}
