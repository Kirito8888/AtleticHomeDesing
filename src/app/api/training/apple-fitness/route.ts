import { ApiError, enforceRateLimit, parseBody, route } from "@/lib/api";
import { ingestWorkouts } from "@/lib/apple-fitness/inbox-service";
import { payloadSchema } from "@/lib/apple-fitness/payload";
import { userForAppleToken } from "@/lib/apple-fitness/token-service";
import { staffGate } from "@/lib/auth/staff-gate";
import { clientIp } from "@/lib/rate-limit";

/**
 * Recibe entrenos del Atajo de iOS (Apple Fitness). Sin sesión a propósito: se autentica con el token
 * personal (`Authorization: Bearer`), que se puede revocar en Ajustes. Los entrenos NO entran en el diario:
 * van a la bandeja de borradores de /training. Límite por IP (antes de mirar el token) y por usuaria.
 */
export const POST = route(async (req) => {
  await enforceRateLimit("appleFitness", clientIp(req.headers));
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  const user = m ? await userForAppleToken(m[1]) : null;
  if (!user) throw new ApiError(401, "Token no válido o revocado", undefined, { "WWW-Authenticate": "Bearer" });
  // v3.0 D: ADMIN/COACH sin 2FA pasada la gracia solo pueden configurarla
  if ((await staffGate(user)).kind === "blocked") throw new ApiError(403, "Activa la verificación en dos pasos para seguir", { code: "second_factor" });
  await enforceRateLimit("appleFitness", user.id);
  const workouts = await parseBody(req, payloadSchema);
  return ingestWorkouts(user.id, workouts);
});
