import { chunkRequestSchema, chunkStudyContent } from "@/lib/ai/study-chunk";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Divide un apunte, tema o texto en micro-pasos de 5–15 min. No guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return chunkStudyContent(user.id, await parseBody(req, chunkRequestSchema));
});
