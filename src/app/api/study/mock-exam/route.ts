import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { mockExamSchema, mockResultSchema, pickRandom } from "@/lib/study/mock-exam";

/** v1.8 · Examen simulado: N tarjetas al azar del mazo (sin IA). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { deckId, count } = await parseBody(req, mockExamSchema);
  const cards = await prisma.flashcard.findMany({ where: { deckId, deck: { userId: user.id } }, select: { id: true, front: true, back: true } });
  if (cards.length < 3) throw new ApiError(400, "El mazo necesita al menos 3 tarjetas");
  return { cards: pickRandom(cards, count) };
});

/** Resultado: las falladas vuelven a tocar hoy en el repaso. */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { deckId, failed } = await parseBody(req, mockResultSchema);
  const { count } = await prisma.flashcard.updateMany({ where: { id: { in: failed }, deckId, deck: { userId: user.id } }, data: { dueAt: new Date() } });
  return { toReview: count };
});
