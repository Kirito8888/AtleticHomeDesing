import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { disciplineEnum } from "@/lib/training/schemas";
import { recomputeDailyLoads } from "@/lib/training/service";

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, name: true, email: true, role: true, timezone: true, athleteProfile: true },
  });
});

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  birthDate: isoDate.nullish(),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
  heightCm: z.number().min(100).max(250).nullish(),
  bodyWeightKg: z.number().min(20).max(300).nullish(),
  primaryDiscipline: disciplineEnum.nullish(),
  disciplines: z.array(disciplineEnum).max(11).optional(),
  ctlTimeConstant: z.number().int().min(14).max(90).optional(),
  atlTimeConstant: z.number().int().min(3).max(21).optional(),
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const { name, birthDate, ...profile } = await parseBody(req, schema);
  const data = { ...profile, birthDate: birthDate === undefined ? undefined : birthDate ? dateOnly(birthDate) : null };
  const [, updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name } }),
    prisma.athleteProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
  ]);
  // Cambiar las constantes del modelo de Banister reescribe toda la serie PMC.
  if (profile.ctlTimeConstant !== undefined || profile.atlTimeConstant !== undefined) {
    await prisma.dailyLoad.deleteMany({ where: { userId: user.id } });
    await recomputeDailyLoads(user.id, today());
  }
  return updated;
});
