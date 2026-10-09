import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { askSchema, askTrainingData } from "@/lib/ai/data-ai";
import { requireUser } from "@/lib/auth/session";

/** Pregunta a tus datos de entreno (resumen numérico, sin datos de salud). */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiChat", user.id);
  const { question } = await parseBody(req, askSchema);
  return askTrainingData(user.id, question);
});
