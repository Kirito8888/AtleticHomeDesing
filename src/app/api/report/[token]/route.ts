import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { clientIp } from "@/lib/rate-limit";
import { reportHtml } from "@/lib/report/service";

/**
 * Informe para la entrenadora. Público a propósito (ella no tiene cuenta): el
 * secreto es el token de 32 bytes; caduca a los 7 días y se puede revocar.
 * HTML sin JavaScript con una CSP que no permite cargar nada.
 */
export const GET = route<RouteContext<"/api/report/[token]">>(async (req, ctx) => {
  enforceRateLimit("sharedReport", clientIp(req.headers));
  const { token } = await ctx.params;
  const html = await reportHtml(token);
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
