import { reviewPractice } from "@/lib/ai/study-practice";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { reviewRequestSchema } from "@/lib/study/practice";

/**
 * `POST /api/ai/study/practice/review` · Corrige con IA el código escrito (nunca se ejecuta): veredicto, comentario por línea y pasos.
 *
 * - Entrada: JSON `reviewRequestSchema` (código ≤ 8000 caracteres). Salida: 200 `{ review, model }`. No guarda nada.
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 asignatura no suya ·
 *   429 `aiChat` (60/h) · 503 IA sin configurar.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiChat", user.id);
  return reviewPractice(user.id, await parseBody(req, reviewRequestSchema));
});
