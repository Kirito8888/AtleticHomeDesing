import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { computeAttempt, JUMP_TYPES, jumpNotes, jumpSessionSchema, summarizeAttempts } from "@/lib/training/jump";
import { TEST_CATALOG } from "@/lib/training/physical-tests";

/** Sesión de saltos medidos por vídeo: el servidor recalcula y guarda el mejor y la media (nunca el vídeo). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, jumpSessionSchema);
  const attempts = input.attempts.map((f) => computeAttempt(input.type, input.fps, f));
  const sum = summarizeAttempts(input.type, attempts)!;
  const notes = jumpNotes(input.type, input.fps, input.attempts);
  const round = (n: number) => Math.round(n * 100) / 100;
  const row = (key: keyof typeof TEST_CATALOG, value: number) => {
    const c = TEST_CATALOG[key];
    return { userId: user.id, testKey: key, name: c.name, unit: c.unit, higherIsBetter: c.higherIsBetter, value: round(value), date: dateOnly(input.date), notes };
  };
  const t = JUMP_TYPES[input.type];
  const [best, mean] = await prisma.$transaction([
    prisma.testResult.create({ data: row(t.best, sum.bestValue), select: { id: true } }),
    prisma.testResult.create({ data: row(t.mean, sum.mean), select: { id: true } }),
  ]);
  return { best: best.id, mean: mean.id, bestValue: round(sum.bestValue), meanValue: round(sum.mean) };
});
