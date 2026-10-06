import { NextResponse } from "next/server";

import { createDocumentFromUpload } from "@/lib/ai/rag";
import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enqueueIngest } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.studyDocument.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      subject: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      error: true,
      createdAt: true,
      _count: { select: { chunks: true, flashcards: true } },
    },
  });
});

/**
 * multipart/form-data: file (PDF/TXT/MD), title?, subject?
 * Responde 202 con el documento en PENDING; el proceso sigue en segundo plano
 * (consultar GET hasta EMBEDDED o FAILED).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiUpload", user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  const doc = await createDocumentFromUpload(user.id, file, {
    title: form.get("title")?.toString(),
    subject: form.get("subject")?.toString(),
  });
  await enqueueIngest(doc.id);
  return NextResponse.json(doc, { status: 202 });
});
