import { rm } from "node:fs/promises";

import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/ai/documents/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const doc = await prisma.studyDocument.findFirst({ where: { id, userId: user.id } });
  if (!doc) throw new ApiError(404, "Documento no encontrado");
  await prisma.studyDocument.delete({ where: { id } }); // chunks en cascada
  if (doc.storagePath) await rm(doc.storagePath, { force: true });
  return { ok: true };
});
