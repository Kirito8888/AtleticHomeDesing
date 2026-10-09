import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PREHAB_TEMPLATES, prehabRoutineSchema } from "@/lib/training/prehab";

/** Rutinas de prehabilitación: listar · crear desde una plantilla o propia. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.prehabRoutine.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, prehabRoutineSchema);
  const data = "template" in input ? PREHAB_TEMPLATES[input.template] : input;
  return prisma.prehabRoutine.create({ data: { userId: user.id, name: data.name, exercises: data.exercises.map((e) => ({ ...e })) }, select: { id: true } });
});
