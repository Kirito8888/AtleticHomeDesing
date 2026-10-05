import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  canPlan: z.boolean().optional(),
});

/**
 * El atleta acepta/revoca y decide si el coach puede planificar.
 * El coach solo puede revocar su propio vínculo.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/coach/links/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const data = await parseBody(req, schema);
  const link = await prisma.coachAthlete.findUnique({ where: { id } });
  if (!link || (link.athleteId !== user.id && link.coachId !== user.id)) throw new ApiError(404, "No encontrado");

  const isAthlete = link.athleteId === user.id;
  if (!isAthlete && (data.status === "ACTIVE" || data.canPlan !== undefined)) {
    throw new ApiError(403, "Solo el atleta puede aceptar o conceder permisos");
  }
  return prisma.coachAthlete.update({
    where: { id },
    data: {
      ...data,
      acceptedAt: data.status === "ACTIVE" && !link.acceptedAt ? new Date() : undefined,
    },
  });
});
