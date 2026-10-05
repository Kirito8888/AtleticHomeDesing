import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Mazos con total de tarjetas y cuántas tocan hoy. */
export const GET = route(async () => {
  const user = await requireUser();
  const now = new Date();
  const decks = await prisma.flashcardDeck.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });
  const due = await prisma.flashcard.groupBy({
    by: ["deckId"],
    where: { deck: { userId: user.id }, dueAt: { lte: now } },
    _count: { _all: true },
  });
  return decks.map((d) => ({ ...d, dueCount: due.find((x) => x.deckId === d.id)?._count._all ?? 0 }));
});
