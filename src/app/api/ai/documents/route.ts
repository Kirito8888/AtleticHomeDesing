import { NextResponse } from "next/server";

import { publicDocError } from "@/lib/ai/doc-error";
import { createDocumentFromUpload } from "@/lib/ai/rag";
import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assignDocument, requireModule } from "@/lib/study/modules-service";
import { enqueueIngest } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  const docs = await prisma.studyDocument.findMany({
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
  return docs.map((d) => ({ ...d, error: publicDocError(d.error) }));
});

/**
 * multipart/form-data: file (PDF/TXT/MD), title?, subject?, moduleId?
 * Responde 202 con el documento en PENDING; el proceso sigue en segundo plano
 * (consultar GET hasta EMBEDDED o FAILED).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiUpload", user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  const moduleId = form.get("moduleId")?.toString() || null;
  if (moduleId) await requireModule(user.id, moduleId); // antes de subir nada
  const doc = await createDocumentFromUpload(user.id, file, {
    title: form.get("title")?.toString(),
    subject: form.get("subject")?.toString(),
  });
  if (moduleId) await assignDocument(user.id, doc.id, moduleId);
  await enqueueIngest(doc.id);
  return NextResponse.json(doc, { status: 202 });
});
