import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { moveSchema, moveSession } from "@/lib/training/move-service";

/** Mover o duplicar una sesión planificada (solo las propias). */
export const POST = route(async (req, ctx: RouteContext<"/api/training/sessions/[id]/move">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return moveSession(user.id, id, await parseBody(req, moveSchema));
});
