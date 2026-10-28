import { generateSelfTest } from "@/lib/ai/study-self-test";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { selfTestRequestSchema } from "@/lib/study/self-test";

/**
 * `POST /api/ai/study/self-test` · Redacta un test de 6, 8 o 12 preguntas de la asignatura, repartidas por prioridad de tema.
 *
 * - Entrada: JSON `selfTestRequestSchema`. Salida: 200 preguntas con cita verificada contra los apuntes. **No guarda nada**
 *   (el resultado vive en `localStorage` del cliente).
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 asignatura no suya ·
 *   409 sin apuntes procesados · 422 sin temas · 429 `aiGenerate` (10/h) · 502 la IA no dio un test utilizable (< 3 preguntas) · 503 IA sin configurar.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return generateSelfTest(user.id, await parseBody(req, selfTestRequestSchema));
});
