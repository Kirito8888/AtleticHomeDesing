import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { recentEvents } from "@/lib/security/audit";

/** Últimos eventos de seguridad de la cuenta (inicios de sesión, cambios, exportaciones…). */
export const GET = route(async () => {
  const user = await requireUser();
  return recentEvents(user.id, 50);
});
