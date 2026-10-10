import { route } from "@/lib/api";
import { deletePasskey } from "@/lib/auth/passkey";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

export const DELETE = route(async (req, ctx: RouteContext<"/api/account/passkeys/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deletePasskey(user.id, id, auditContext(req.headers));
  return { ok: true };
});
