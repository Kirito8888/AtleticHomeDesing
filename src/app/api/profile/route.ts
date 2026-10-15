import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { EVENTS } from "@/lib/training/disciplines";
import { profileSchema } from "@/lib/training/profile-schema";
import { recomputeDailyLoads } from "@/lib/training/service";

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, name: true, email: true, role: true, timezone: true, athleteProfile: true },
  });
});

const schema = profileSchema.extend({ name: z.string().trim().min(1).max(100).optional() });

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const { name, birthDate, ...profile } = await parseBody(req, schema);
  // La especialidad manda: fija la disciplina principal coherente con ella
  if (profile.primaryEvent) profile.primaryDiscipline = EVENTS[profile.primaryEvent].discipline;
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
