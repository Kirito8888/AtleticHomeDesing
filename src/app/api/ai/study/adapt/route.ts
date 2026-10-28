import { adaptRequestSchema, adaptStudyContent } from "@/lib/ai/study-adapt";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/**
 * `POST /api/ai/study/adapt` · Resumen TDAH, esquema visual o informe a partir de un apunte, un tema (RAG) o un texto pegado.
 *
 * - Entrada: JSON `adaptRequestSchema` (modo + fuente). Salida: 200 documento ya normalizado con `LIMITS`. **No guarda nada.**
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 apunte no suyo ·
 *   409 apunte aún sin procesar · 422 el tema no aparece en sus apuntes · 429 `aiGenerate` (10/h) · 503 IA sin configurar.
 * - Aislamiento: apuntes y búsqueda filtrados por el `userId` de la sesión.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return adaptStudyContent(user.id, await parseBody(req, adaptRequestSchema));
});
