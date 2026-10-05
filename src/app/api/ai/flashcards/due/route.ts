import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ deckId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }));
  return prisma.flashcard.findMany({
    where: { deck: { userId: user.id }, deckId: q.deckId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: q.limit,
  });
});
