import { ApiError, parseBody, route } from "@/lib/api";
import { trashSession } from "@/lib/account/trash";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSessionSchema } from "@/lib/training/schemas";
import { updateTrainingSession } from "@/lib/training/service";
import { notFromStrava } from "@/lib/strava/policy";

type Ctx = RouteContext<"/api/training/sessions/[id]">;

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "SESSIONS");
  const session = await prisma.trainingSession.findFirst({
    // v1.10 · Lo importado de Strava solo lo ve su dueño
    where: { id, userId, ...(userId !== user.id ? notFromStrava : {}) },
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
  // v1.8 · a la papelera (7 días, se puede deshacer)
  const { id: trashId } = await trashSession(userId, id);
  return { ok: true, trashId };
});
