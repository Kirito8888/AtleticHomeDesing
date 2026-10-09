import { ApiError, route } from "@/lib/api";
import { loginOptions } from "@/lib/auth/passkey";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * v1.7 · Reto para entrar con una llave de acceso. Pública (aún no hay sesión): no devuelve datos de
 * nadie, solo un reto aleatorio de un solo uso que caduca en 5 min. Limitada por IP como el login.
 */
export const POST = route(async (req) => {
  if (!rateLimit(`passkey-options:${clientIp(req.headers)}`, LIMITS.login.limit * 2, LIMITS.login.windowMs).ok) throw new ApiError(429, "Demasiados intentos. Espera unos minutos.");
  return loginOptions(new URL(req.url).origin);
});
