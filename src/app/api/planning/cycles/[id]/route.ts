import { ApiError, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Borra el ciclo y sus subciclos (cascada). Las sesiones quedan sin ciclo. */
export const DELETE = route(async (req, ctx: RouteContext<"/api/planning/cycles/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "write");
  const { count } = await prisma.trainingCycle.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Ciclo no encontrado");
  return { ok: true };
});
