import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { feedIcs } from "@/lib/planning/feed-service";
import { clientIp } from "@/lib/rate-limit";

/**
 * Público a propósito (lo piden Google/Apple Calendar sin sesión): el secreto
 * es el token de 32 bytes. Solo títulos, fechas y lugar; límite por IP.
 */
export const GET = route<RouteContext<"/api/calendar/ics/[token]">>(async (req, ctx) => {
  enforceRateLimit("calendarFeed", clientIp(req.headers));
  const { token } = await ctx.params;
  const ics = await feedIcs(token);
  if (!ics) throw new ApiError(404, "No encontrado");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lifeos.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
});
