import { chunkRequestSchema, chunkStudyContent } from "@/lib/ai/study-chunk";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/**
 * `POST /api/ai/study/chunk` · Divide un apunte, tema o texto en 1–6 micro-pasos de 5–15 min.
 *
 * - Entrada: JSON `chunkRequestSchema`. Salida: 200 pasos normalizados. **No guarda nada.**
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 apunte no suyo ·
 *   409 apunte sin procesar · 422 tema sin coincidencias · 429 `aiGenerate` (10/h) · 503 IA sin configurar.
 * - Aislamiento: solo apuntes de la usuaria de la sesión.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return chunkStudyContent(user.id, await parseBody(req, chunkRequestSchema));
});
