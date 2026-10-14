import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { shareProtocol, unshareProtocol } from "@/lib/recovery/physio-service";

type Ctx = RouteContext<"/api/recovery/physio/[id]/shares">;
const body = z.object({ athleteId: z.string().min(1).max(40) });

/** Comparte en lectura/seguimiento con una atleta vinculada (ámbito RECOVERY; la restricción bloquea). */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  await enforceRateLimit("physioShare", user.id);
  return shareProtocol(user, (await ctx.params).id, (await parseBody(req, body)).athleteId);
});

export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  await unshareProtocol(user, (await ctx.params).id, (await parseBody(req, body)).athleteId);
});
