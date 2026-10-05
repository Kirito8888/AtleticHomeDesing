import { ApiError, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const DELETE = route(async (req, ctx: RouteContext<"/api/planning/events/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "write");
  const { count } = await prisma.calendarEvent.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Evento no encontrado");
  return { ok: true };
});
