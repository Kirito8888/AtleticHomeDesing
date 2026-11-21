import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { discardWorkout, importWorkout, mergeWorkout } from "@/lib/apple-fitness/inbox-service";
import { requireUser } from "@/lib/auth/session";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("merge"), sessionId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("import") }),
  z.object({ action: z.literal("discard") }),
]);

/** Resuelve un borrador: completar una sesión propia, crear aparte (origen privado) o descartar. Siempre con `userId` de la sesión. */
export const POST = route(async (req, ctx: RouteContext<"/api/training/apple-fitness/pending/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (body.action === "merge") return mergeWorkout(user.id, id, body.sessionId);
  if (body.action === "import") return importWorkout(user.id, id);
  return discardWorkout(user.id, id);
});
