import { NextResponse } from "next/server";

import { ingestDocument } from "@/lib/ai/rag";
import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
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

/** multipart/form-data: file (PDF/TXT/MD), title?, subject? */
export const POST = route(async (req) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  const doc = await ingestDocument(user.id, file, {
    title: form.get("title")?.toString(),
    subject: form.get("subject")?.toString(),
  });
  return NextResponse.json(doc, { status: 201 });
});
