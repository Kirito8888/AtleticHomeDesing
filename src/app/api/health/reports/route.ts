import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { createHealthReport, healthReportSchema, listHealthReports } from "@/lib/health/health-report";
import { womenEnabled } from "@/lib/health/women-service";

/** Enlaces temporales para la médica (MEDICAL) o el fisio (PHYSIO). El token solo se devuelve al crearlo. */
export const GET = route(async () => {
  const user = await requireUser();
  return listHealthReports(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { kind } = await parseBody(req, healthReportSchema);
  if (kind === "MEDICAL" && !(await womenEnabled(user.id))) throw new ApiError(403, "Solo disponible en Salud de la mujer");
  const { token, expiresAt } = await createHealthReport(user.id, kind);
  await recordEvent(user.id, "SHARE_LINK_CREATED", auditContext(req.headers), `salud (${kind === "MEDICAL" ? "médica" : "fisio"})`);
  const base = (env().AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return { url: `${base}/api/shared/health/${token}`, expiresAt: expiresAt.toISOString() };
});
