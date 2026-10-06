import { NextResponse } from "next/server";

import { assertAiAllowed } from "@/lib/ai/guard";
import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enqueueIngest } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

/** Vuelve a encolar un documento que falló (p. ej. Gemini no respondía). */
export const POST = route(async (_req, ctx: RouteContext<"/api/ai/documents/[id]/retry">) => {
  const user = await requireUser();
  enforceRateLimit("aiUpload", user.id);
  const { id } = await ctx.params;
  const doc = await prisma.studyDocument.findFirst({ where: { id, userId: user.id } });
  if (!doc) throw new ApiError(404, "Documento no encontrado");
  if (doc.status !== "FAILED") throw new ApiError(409, "Solo se reintentan documentos fallidos");
  await assertAiAllowed(user.id);
  await prisma.studyDocument.update({ where: { id }, data: { status: "PENDING", error: null } });
  await enqueueIngest(id);
  return NextResponse.json({ ok: true }, { status: 202 });
});
