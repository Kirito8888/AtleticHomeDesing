import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { eventUpdateSchema } from "@/lib/clubs/events";
import { deleteEvent, updateEvent } from "@/lib/clubs/events-service";

export const PATCH = route(async (req, ctx: RouteContext<"/api/clubs/[id]/events/[eventId]">) => {
  const user = await requireUser();
  const { id, eventId } = await ctx.params;
  const ev = await updateEvent(user, id, eventId, await parseBody(req, eventUpdateSchema));
  return { id: ev.id };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/clubs/[id]/events/[eventId]">) => {
  const user = await requireUser();
  const { id, eventId } = await ctx.params;
  await deleteEvent(user, id, eventId);
  return { ok: true };
});
