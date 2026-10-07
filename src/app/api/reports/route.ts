import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createReport, createReportSchema, listReports } from "@/lib/report/service";

/** Enlaces del informe para la entrenadora: listar los activos y crear uno. */
export const GET = route(async () => {
  const user = await requireUser();
  return listReports(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, createReportSchema);
  const { token, expiresAt } = await createReport(user.id, input);
  const base = (env().AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return { url: `${base}/api/report/${token}`, expiresAt: expiresAt.toISOString() };
});
