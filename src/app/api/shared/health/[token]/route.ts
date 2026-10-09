import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { healthReportHtml } from "@/lib/health/health-report";
import { clientIp } from "@/lib/rate-limit";

/**
 * Resumen para la médica o el fisio. Público a propósito (no tienen cuenta): el secreto es
 * el token de 32 bytes; caduca a los 7 días y se puede revocar. HTML sin JavaScript.
 */
export const GET = route<RouteContext<"/api/shared/health/[token]">>(async (req, ctx) => {
  enforceRateLimit("sharedReport", clientIp(req.headers));
  const { token } = await ctx.params;
  const html = await healthReportHtml(token);
  if (!html) throw new ApiError(404, "Este enlace no existe o ha caducado");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
