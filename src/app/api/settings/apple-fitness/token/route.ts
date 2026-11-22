import { route } from "@/lib/api";
import { appleTokenStatus, createAppleToken, revokeAppleToken } from "@/lib/apple-fitness/token-service";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { auditContext, recordEvent } from "@/lib/security/audit";

/** Token personal de envío para el Atajo de iOS: estado, generar (sustituye al anterior) y revocar. */
export const GET = route(async () => {
  const user = await requireUser();
  return appleTokenStatus(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const token = await createAppleToken(user.id);
  await recordEvent(user.id, "SHARE_LINK_CREATED", auditContext(req.headers), "token de envío Apple Fitness");
  const base = (env().AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // El token solo se muestra ahora: en la BD queda su hash.
  return { token, endpoint: `${base}/api/training/apple-fitness` };
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await revokeAppleToken(user.id);
  return { ok: true };
});
