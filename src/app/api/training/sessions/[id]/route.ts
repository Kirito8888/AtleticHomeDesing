import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSessionSchema } from "@/lib/training/schemas";
import { deleteTrainingSession, updateTrainingSession } from "@/lib/training/service";

type Ctx = RouteContext<"/api/training/sessions/[id]">;

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "SESSIONS");
  const session = await prisma.trainingSession.findFirst({
    where: { id, userId },
    // Las sensaciones (molestias) son datos de salud: solo para su dueño.
    omit: { feelings: userId !== user.id },
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

/** Edita una sesión (mismo cuerpo que POST /api/training/sessions). Recalcula TSS, marcas y PMC. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "SESSIONS", "write");
  return updateTrainingSession(userId, id, await parseBody(req, createSessionSchema));
});

export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "SESSIONS", "write");
  await deleteTrainingSession(userId, id);
  return { ok: true };
});
