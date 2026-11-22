import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { resolveConflict } from "@/lib/recovery/health-sync-service";

const body = z.object({ keep: z.enum(["current", "incoming"]) });

/** Elegir con qué valor quedarse en un aviso de Apple Salud. Solo la dueña (sin resolveAthleteId). */
export const POST = route(async (req, ctx: RouteContext<"/api/recovery/apple-health/conflicts/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { keep } = await parseBody(req, body);
  return resolveConflict(user.id, id, keep);
});
