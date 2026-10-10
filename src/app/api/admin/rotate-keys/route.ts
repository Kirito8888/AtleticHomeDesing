import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { reencryptAll } from "@/lib/security/rotate";

/** v1.7 · Vuelve a cifrar todos los datos cifrados con la clave actual (tras rotarla). Solo admin. */
export const POST = route(async () => {
  await requireAdmin();
  return reencryptAll();
});
