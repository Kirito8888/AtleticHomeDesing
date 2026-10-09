import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rescheduleSuggestions } from "@/lib/training/move-service";

/** Días propuestos para recolocar una sesión planificada (no mueve nada: se mueve con /move). */
export const GET = route(async (_req, ctx: RouteContext<"/api/training/sessions/[id]/reschedule">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return rescheduleSuggestions(user.id, id);
});
