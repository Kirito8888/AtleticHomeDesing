import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteProtocol, getOwn, updateProtocol } from "@/lib/recovery/physio-service";

import { protocolBody } from "@/lib/recovery/physio-protocol";

type Ctx = RouteContext<"/api/recovery/physio/[id]">;

export const GET = route(async (_req, ctx: Ctx) => getOwn(await requireUser(), (await ctx.params).id));

export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  return updateProtocol(user, (await ctx.params).id, await parseBody(req, protocolBody.partial()));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await deleteProtocol(await requireUser(), (await ctx.params).id);
});
