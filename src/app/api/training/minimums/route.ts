import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { minimumSchema } from "@/lib/training/javelin-insights";

/** Mínimas y objetivos (a mano). */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.minimum.findMany({ where: { userId: user.id }, orderBy: { deadline: { sort: "asc", nulls: "last" } } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const m = await parseBody(req, minimumSchema);
  return prisma.minimum.create({ data: { userId: user.id, name: m.name, markM: m.markM, deadline: m.deadline ? dateOnly(m.deadline) : null, implementWeightG: m.implementWeightG ?? null }, select: { id: true } });
});
