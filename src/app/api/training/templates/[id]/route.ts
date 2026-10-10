import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { setTemplateShared } from "@/lib/training/template-library";

type Ctx = RouteContext<"/api/training/templates/[id]">;

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.sessionTemplate.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Plantilla no encontrada");
  return { ok: true };
});

/** v1.8 · La entrenadora comparte (o deja de compartir) una plantilla con sus atletas. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  if (user.role !== "COACH") throw new ApiError(403, "Solo las cuentas de entrenador comparten plantillas");
  const { id } = await ctx.params;
  const { shared } = await parseBody(req, z.object({ shared: z.boolean() }));
  await setTemplateShared(user.id, id, shared);
  return { ok: true };
});
