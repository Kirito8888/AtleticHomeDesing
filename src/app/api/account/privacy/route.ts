import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { consentOverview, logPrivacyRequest, privacyRequestSchema, setRestriction } from "@/lib/privacy/service";
import { auditContext } from "@/lib/security/audit";

/** v1.7 · Privacidad: consentimientos y derechos. POST `{restrict}` limita o levanta; `{right, detail}` deja constancia. */
export const GET = route(async () => {
  const user = await requireUser();
  return consentOverview(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.union([z.object({ restrict: z.boolean() }), privacyRequestSchema]));
  if ("restrict" in body) {
    await setRestriction(user.id, body.restrict, auditContext(req.headers));
    return { ok: true };
  }
  // Rectificación y oposición se atienden en la propia app; queda constancia de la petición
  return logPrivacyRequest(user.id, body.right, body.detail ?? null, false, auditContext(req.headers));
});
