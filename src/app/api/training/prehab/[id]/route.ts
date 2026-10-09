import { z } from "zod";

import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { prehabExerciseSchema } from "@/lib/training/prehab";

const patchSchema = z.object({ name: z.string().trim().min(1).max(60), exercises: z.array(prehabExerciseSchema).min(1).max(20), archived: z.boolean() }).partial();

/** Editar (nombre, ejercicios) o archivar una rutina. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/training/prehab/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const data = await parsePatchBody(req, patchSchema);
  const { count } = await prisma.prehabRoutine.updateMany({ where: { id, userId: user.id }, data });
  if (!count) throw new ApiError(404, "Rutina no encontrada");
  return { ok: true };
});
