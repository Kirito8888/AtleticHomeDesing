import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getShared, updateShared } from "@/lib/recovery/physio-service";

type Ctx = RouteContext<"/api/recovery/physio/shared/[shareId]">;

export const GET = route(async (_req, ctx: Ctx) => getShared(await requireUser(), (await ctx.params).shareId));

const patch = z.object({ progress: z.array(z.array(z.boolean()).max(10)).max(8).optional(), painToday: z.number().int().min(0).max(10).nullable().optional() });

/** Solo la atleta destinataria marca criterios y dolor; el contenido del protocolo no se toca. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  return updateShared(user, (await ctx.params).shareId, await parseBody(req, patch));
});
