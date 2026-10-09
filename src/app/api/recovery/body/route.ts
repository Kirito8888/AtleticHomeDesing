import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { bodyMeasureSchema } from "@/lib/recovery/body-measures";

/** Perímetros y pliegues (solo su dueño; el coach no tiene acceso). */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.bodyMeasure.findMany({ where: { userId: user.id }, orderBy: { date: "desc" } });
  return rows.map((r) => ({ id: r.id, date: toIsoDay(r.date), ...(r.data as object) }));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const m = await parseBody(req, bodyMeasureSchema);
  return prisma.bodyMeasure.create({ data: { userId: user.id, date: dateOnly(m.date), data: { girths: m.girths, skinfolds: m.skinfolds } }, select: { id: true } });
});
