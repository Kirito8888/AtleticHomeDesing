import { adaptRequestSchema, adaptStudyContent } from "@/lib/ai/study-adapt";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Resumen TDAH o esquema visual a partir de un apunte, un tema o un texto. No guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  return adaptStudyContent(user.id, await parseBody(req, adaptRequestSchema));
});
