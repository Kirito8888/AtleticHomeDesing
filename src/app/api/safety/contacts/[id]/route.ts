import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setContactStatus } from "@/lib/health/safety-service";

/** El contacto acepta (ACTIVE) o cualquiera de los dos lo quita (REVOKED). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/safety/contacts/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { status } = await parseBody(req, z.object({ status: z.enum(["ACTIVE", "REVOKED"]) }));
  await setContactStatus(user.id, id, status);
  return { ok: true };
});
