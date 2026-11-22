import { ApiError, enforceRateLimit, parseBody, route } from "@/lib/api";
import { userForAppleToken } from "@/lib/apple-fitness/token-service";
import { staffGate } from "@/lib/auth/staff-gate";
import { clientIp } from "@/lib/rate-limit";
import { healthPayloadSchema } from "@/lib/recovery/health-sync";
import { ingestHealthDays } from "@/lib/recovery/health-sync-service";

/**
 * Recibe las métricas diarias del Atajo de iOS (Apple Salud: sueño, VFC SDNN, FC en reposo, peso). Sin sesión a
 * propósito: se autentica con el mismo token personal que Apple Fitness (`Authorization: Bearer`, revocable en Ajustes).
 * Vacío o igual → se guarda/conserva solo; distinto de lo anotado → aviso de conflicto en /recovery, nunca se pisa.
 */
export const POST = route(async (req) => {
  await enforceRateLimit("appleHealth", clientIp(req.headers));
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  const user = m ? await userForAppleToken(m[1]) : null;
  if (!user) throw new ApiError(401, "Token no válido o revocado", undefined, { "WWW-Authenticate": "Bearer" });
  if ((await staffGate(user)).kind === "blocked") throw new ApiError(403, "Activa la verificación en dos pasos para seguir", { code: "second_factor" });
  await enforceRateLimit("appleHealth", user.id);
  const days = await parseBody(req, healthPayloadSchema);
  return ingestHealthDays(user.id, days);
});
