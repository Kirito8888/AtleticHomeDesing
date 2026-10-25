import { generateSelfTest } from "@/lib/ai/study-self-test";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { selfTestRequestSchema } from "@/lib/study/self-test";

/** Redacta un test de autoevaluación de la asignatura. No guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return generateSelfTest(user.id, await parseBody(req, selfTestRequestSchema));
});
