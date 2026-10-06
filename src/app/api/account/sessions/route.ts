import { revokeAllSessions } from "@/lib/account/service";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Cierra la sesión en todos los dispositivos (incluido este). */
export const DELETE = route(async () => {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  return { ok: true, signedOut: true };
});
