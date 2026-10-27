import { generateQuest } from "@/lib/ai/study-quest";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { questRequestSchema } from "@/lib/study/quest-ai";

/**
 * `POST /api/ai/study/quest` · Preguntas de un nivel del Modo Juego (`nodeId` = id de tema o `boss`) generadas desde los apuntes
 * EMBEDDED de la asignatura. Comando y opciones deben estar anclados en los apuntes o se descartan.
 *
 * - Entrada: JSON `questRequestSchema` (`moduleId`, `nodeId`). Salida: 200 `{ items, model }`. **No guarda nada**; la corrección es local.
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 asignatura o nivel no suyo ·
 *   409 sin apuntes procesados · 429 `aiGenerate` (10/h) · 502 quedan menos de 4 preguntas válidas · 503 IA sin configurar.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return generateQuest(user.id, await parseBody(req, questRequestSchema));
});
