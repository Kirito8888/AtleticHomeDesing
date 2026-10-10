import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { reencryptAll } from "@/lib/security/rotate";

/** v1.7 · Vuelve a cifrar todos los datos cifrados con la clave actual (tras rotarla). Solo admin. */
export const POST = route(async () => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo para administración");
  return reencryptAll();
});
