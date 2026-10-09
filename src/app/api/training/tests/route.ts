import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { summarizeTests, testDefinition, testResultSchema } from "@/lib/training/physical-tests";

/** Batería de tests físicos: resumen por test y alta de un resultado. */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.testResult.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  return summarizeTests(rows.map((r) => ({ ...r, date: toIsoDay(r.date) })));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, testResultSchema);
  const def = testDefinition(input);
  return prisma.testResult.create({ data: { userId: user.id, ...def, value: input.value, date: dateOnly(input.date), notes: input.notes ?? null }, select: { id: true } });
});
