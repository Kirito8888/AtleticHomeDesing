import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rsvpSchema } from "@/lib/clubs/events";
import { respond } from "@/lib/clubs/events-service";

/** Mi respuesta (sí/no/quizá) a un evento de mi club. */
export const PUT = route(async (req, ctx: RouteContext<"/api/clubs/[id]/events/[eventId]/response">) => {
  const user = await requireUser();
  const { id, eventId } = await ctx.params;
  return await respond(user, id, eventId, (await parseBody(req, rsvpSchema)).answer);
});
