import { deleteDeck } from "@/lib/ai/flashcards";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Borra el mazo entero: solo la dueña (una lectora lo «deja» con DELETE …/shares). */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/ai/flashcards/decks/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return deleteDeck(user.id, id);
});
