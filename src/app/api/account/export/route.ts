import { exportAccount } from "@/lib/account/service";
import { ExportQueryError, parseExportQuery } from "@/lib/account/export-modules";
import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { logPrivacyRequest } from "@/lib/privacy/service";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { toIsoDay, today } from "@/lib/dates";

/**
 * Descarga de mis datos en JSON (arts. 15 y 20). Guiada (v3.2 N): `?modules=finance,study` elige módulos
 * (sin `modules`, todos) y `&sensitive=1` añade lo cifrado (ciclo, salud de la mujer, ISAK, bienestar,
 * «entreno sola»), que por defecto NO sale. Solo datos propios; lleva el pie de autoría (`notice`).
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("export", user.id);
  let selection;
  try {
    selection = parseExportQuery(new URL(req.url).searchParams);
  } catch (e) {
    if (e instanceof ExportQueryError) throw new ApiError(400, e.message);
    throw e;
  }
  const data = await exportAccount(user.id, selection);
  // Solo qué módulos y si hubo datos cifrados: nunca valores
  const what = `JSON · módulos: ${selection.modules.join(", ")}${selection.sensitive ? " · con datos cifrados" : ""}`;
  await recordEvent(user.id, "DATA_EXPORTED", auditContext(req.headers), what);
  // v1.7 · Derecho de acceso y portabilidad (arts. 15 y 20): atendido en el momento
  await logPrivacyRequest(user.id, "PORTABILITY", `exportación ${what}`, true);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lifeos-export-${toIsoDay(today())}.json"`,
      "cache-control": "no-store",
    },
  });
});
