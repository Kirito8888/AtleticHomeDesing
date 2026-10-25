import { NextResponse } from "next/server";

import { adaptSaveSchema, saveAdaptedContent } from "@/lib/ai/study-adapt";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Guarda como apunte NUEVO lo que la atleta ha confirmado (nunca sobrescribe apuntes ni flashcards). */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiUpload", user.id);
  const doc = await saveAdaptedContent(user.id, await parseBody(req, adaptSaveSchema));
  return NextResponse.json(doc, { status: 201 });
});
