import { z } from "zod";

import { dailyCap, dueCards } from "@/lib/ai/flashcards";
import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ deckId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }));
  // V3-N03: el tope diario manda también en el servidor (la lista nunca pasa de lo que queda hoy)
  const { remaining } = await dailyCap(user.id);
  if (remaining === 0) return [];
  return dueCards(user.id, { ...q, limit: remaining === null ? q.limit : Math.min(q.limit, remaining) });
});
