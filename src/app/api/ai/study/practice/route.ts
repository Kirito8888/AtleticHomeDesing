import { generatePractice } from "@/lib/ai/study-practice";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { practiceRequestSchema } from "@/lib/study/practice";

/**
 * `POST /api/ai/study/practice` · Propone 3 o 5 ejercicios (enunciado, 2–3 pistas progresivas y solución de referencia)
 * basados solo en los apuntes procesados de la asignatura (o en los `documentIds` elegidos).
 *
 * - Entrada: JSON `practiceRequestSchema`. Salida: 200 `{ exercises, model }`. **No guarda nada** (la tanda vive en `localStorage`).
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 asignatura no suya ·
 *   409 sin apuntes procesados · 429 `aiGenerate` (10/h) · 502 sin ejercicios utilizables · 503 IA sin configurar.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return generatePractice(user.id, await parseBody(req, practiceRequestSchema));
});
