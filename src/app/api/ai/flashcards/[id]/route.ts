import { z } from "zod";

import { deleteCard, updateCard } from "@/lib/ai/flashcards";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

const schema = z.object({ front: z.string().min(3).max(500).optional(), back: z.string().min(1).max(1500).optional() }).refine((v) => v.front || v.back, "Nada que cambiar");

/** Solo la dueña del mazo (una lectora recibe 403). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/ai/flashcards/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateCard(user.id, id, await parseBody(req, schema));
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/ai/flashcards/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return deleteCard(user.id, id);
});
