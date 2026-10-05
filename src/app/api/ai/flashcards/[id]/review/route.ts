import { z } from "zod";

import { reviewFlashcard } from "@/lib/ai/flashcards";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** grade 0–5 (SM-2): 0–2 fallo, 3 difícil, 4 bien, 5 fácil. */
export const POST = route(async (req, ctx: RouteContext<"/api/ai/flashcards/[id]/review">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { grade } = await parseBody(req, z.object({ grade: z.number().int().min(0).max(5) }));
  return reviewFlashcard(user.id, id, grade);
});
