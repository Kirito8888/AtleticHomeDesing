import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { issuePasswordReset, reactivateUser, suspendUser } from "@/lib/auth/access";
import { requireAdmin } from "@/lib/auth/admin";
import { auditContext } from "@/lib/security/audit";

const schema = z.object({ action: z.enum(["suspend", "reactivate", "reset-password"]) });

/** v1.9 · Suspender, reactivar o generar un enlace de contraseña nueva (1 h, un solo uso). */
export const POST = route(async (req, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = await parseBody(req, schema);
  const audit = auditContext(req.headers);
  if (action === "suspend") await suspendUser(admin.id, id, audit);
  else if (action === "reactivate") await reactivateUser(admin.id, id, audit);
  else return issuePasswordReset(admin.id, id, audit);
  return { ok: true };
});
