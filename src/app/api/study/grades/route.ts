import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { gradeAverage, gradeSchema } from "@/lib/study/exam-plan";

/** Notas y créditos: lista con media ponderada · añadir. */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.grade.findMany({ where: { userId: user.id }, orderBy: [{ term: "asc" }, { subject: "asc" }] });
  return { grades: rows, ...gradeAverage(rows) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const g = await parseBody(req, gradeSchema);
  return prisma.grade.create({ data: { userId: user.id, subject: g.subject, term: g.term || null, grade: g.grade ?? null, credits: g.credits }, select: { id: true } });
});
