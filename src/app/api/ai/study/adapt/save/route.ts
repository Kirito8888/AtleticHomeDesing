import { NextResponse } from "next/server";

import { adaptSaveSchema, saveAdaptedContent } from "@/lib/ai/study-adapt";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/**
 * `POST /api/ai/study/adapt/save` · Guarda como apunte `.md` NUEVO lo que la atleta ha confirmado (nunca sobrescribe apuntes ni flashcards).
 *
 * - Entrada: JSON `adaptSaveSchema` (el cliente manda el documento y el servidor lo valida y normaliza de nuevo).
 * - Salida: 201 el apunte creado (EMBEDDED, indexado por texto).
 * - Errores: 400 · 401 · 403 origen/condiciones · 413 cuota de 5 GB superada · 422 sin contenido · 429 `aiUpload` (10/h).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiUpload", user.id);
  const doc = await saveAdaptedContent(user.id, await parseBody(req, adaptSaveSchema));
  return NextResponse.json(doc, { status: 201 });
});
