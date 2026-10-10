import { credentialSchema, credentialView, deleteCredential, saveCredential } from "@/lib/ai/credentials";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

/** v1.9 · IA propia: lo que se ve nunca incluye la clave (solo sus 4 últimos caracteres). */
export const GET = route(async () => {
  const user = await requireUser();
  return credentialView(user.id);
});

/** Guarda tras probar la conexión; si cambia el proveedor, hay que volver a dar el consentimiento. */
export const PUT = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiProvider", user.id);
  const input = await parseBody(req, credentialSchema);
  return saveCredential(user.id, input, auditContext(req.headers));
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  return deleteCredential(user.id, auditContext(req.headers));
});
