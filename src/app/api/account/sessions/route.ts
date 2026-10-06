import { revokeAllSessions } from "@/lib/account/service";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

/** Cierra la sesión en todos los dispositivos (incluido este). */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  await revokeAllSessions(user.id, auditContext(req.headers));
  return { ok: true, signedOut: true };
});
