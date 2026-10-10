import { route } from "@/lib/api";
import { acceptTerms, TERMS_VERSION } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

/** v1.9 · Aceptar la versión vigente de las condiciones de uso y la privacidad. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await acceptTerms(user.id, auditContext(req.headers));
  return { ok: true, version: TERMS_VERSION };
});
