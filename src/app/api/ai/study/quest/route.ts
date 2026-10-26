import { generateQuest } from "@/lib/ai/study-quest";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { questRequestSchema } from "@/lib/study/quest-ai";

/** Genera las preguntas de un nivel del Modo Juego desde los apuntes. No guarda nada; la corrección es local. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return generateQuest(user.id, await parseBody(req, questRequestSchema));
});
