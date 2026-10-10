import { route } from "@/lib/api";
import { listUsersForAdmin } from "@/lib/auth/access";
import { requireAdmin } from "@/lib/auth/admin";

/** v1.9 · Cuentas de la instalación: sin datos de salud ni contenido, solo acceso. */
export const GET = route(async () => {
  await requireAdmin();
  return listUsersForAdmin();
});
