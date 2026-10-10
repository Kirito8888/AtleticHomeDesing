import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";
import { disconnectStrava, stravaStatus } from "@/lib/strava/service";

/** v1.10 · Estado de la conexión con Strava. */
export const GET = route(async () => {
  const user = await requireUser();
  return stravaStatus(user.id);
});

/** Desconectar (?deleteSessions=1 borra también las sesiones importadas de Strava). */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  return disconnectStrava(user.id, req.nextUrl.searchParams.get("deleteSessions") === "1", fetch, auditContext(req.headers));
});
