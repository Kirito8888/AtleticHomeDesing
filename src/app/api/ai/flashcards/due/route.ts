import { z } from "zod";

import { dueCards } from "@/lib/ai/flashcards";
import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ deckId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }));
  return dueCards(user.id, q);
});
