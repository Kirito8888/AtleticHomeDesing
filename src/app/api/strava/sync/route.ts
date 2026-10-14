import { enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { syncStrava } from "@/lib/strava/service";

/** v1.10 · «Importar ahora» las actividades nuevas de Strava. */
export const POST = route(async () => {
  const user = await requireUser();
  enforceRateLimit("import", `strava:${user.id}`);
  return syncStrava(user.id, { budget: 30 });
});
