import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { eventIcs } from "@/lib/clubs/event-reminders-service";

/** .ics de un evento de mi club (título, hora y lugar; sin importe ni datos de salud). */
export const GET = route(async (_req, ctx: RouteContext<"/api/clubs/[id]/events/[eventId]/ics">) => {
  const user = await requireUser();
  const { id, eventId } = await ctx.params;
  return new Response(await eventIcs(user, id, eventId), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="evento.ics"', "Cache-Control": "private, no-store" },
  });
});
