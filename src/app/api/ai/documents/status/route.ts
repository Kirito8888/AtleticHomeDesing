import type { NextRequest } from "next/server";

import { publicDocError } from "@/lib/ai/doc-error";
import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const MAX_STATUS_IDS = 50;

/**
 * `GET /api/ai/documents/status?ids=a,b,…` · Estado ligero de los apuntes indicados (v2.8.0 B4, O9): lo sondea
 * `/study` mientras se procesan, en lugar de repintar la página entera. Una sola consulta.
 * Devuelve `[{ id, status, error, chunks, flashcards }]`; los ids que no son suyos simplemente no salen.
 * Errores: 400 más de 50 ids · 401. Aislamiento: filtrado por `userId`.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length > MAX_STATUS_IDS) throw new ApiError(400, `Máximo ${MAX_STATUS_IDS} apuntes por consulta`);
  if (!ids.length) return [];
  const docs = await prisma.studyDocument.findMany({
    where: { userId: user.id, id: { in: ids } },
    select: { id: true, status: true, error: true, _count: { select: { chunks: true, flashcards: true } } },
  });
  return docs.map((d) => ({ id: d.id, status: d.status, error: publicDocError(d.error), chunks: d._count.chunks, flashcards: d._count.flashcards }));
});
