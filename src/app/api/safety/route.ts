import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { safetyOverview } from "@/lib/health/safety-service";

/** «Entreno sola»: mi salida abierta, mis contactos y las salidas de quien me tiene de contacto. */
export const GET = route(async () => {
  const user = await requireUser();
  return safetyOverview(user.id);
});
