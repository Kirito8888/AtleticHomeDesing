import { exportAccount } from "@/lib/account/service";
import { enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { logPrivacyRequest } from "@/lib/privacy/service";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { toIsoDay, today } from "@/lib/dates";

/** Descarga de todos los datos del usuario en JSON. */
export const GET = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("export", user.id);
  const data = await exportAccount(user.id);
  await recordEvent(user.id, "DATA_EXPORTED", auditContext(req.headers), "JSON completo");
  // v1.7 · Derecho de acceso y portabilidad (arts. 15 y 20): atendido en el momento
  await logPrivacyRequest(user.id, "PORTABILITY", "exportación JSON completa", true);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lifeos-export-${toIsoDay(today())}.json"`,
      "cache-control": "no-store",
    },
  });
});
