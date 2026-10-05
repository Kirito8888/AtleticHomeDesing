import { ApiError, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { deleteTrainingSession } from "@/lib/training/service";

type Ctx = RouteContext<"/api/training/sessions/[id]">;

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"));
  const session = await prisma.trainingSession.findFirst({
    where: { id, userId },
    include: {
      track: { include: { intervals: { orderBy: { order: "asc" } } } },
      technical: { include: { attempts: { orderBy: { order: "asc" } } } },
      strength: {
        include: { sets: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true } } } } },
      },
      personalRecords: true,
    },
  });
  if (!session) throw new ApiError(404, "Sesión no encontrada");
  return session;
});

export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "write");
  await deleteTrainingSession(userId, id);
  return { ok: true };
});
