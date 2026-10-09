import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { voiceSchema, voiceToDraft } from "@/lib/ai/data-ai";
import { requireUser } from "@/lib/auth/session";

/** Texto dictado → borrador de sesión de fuerza (se revisa antes de guardar). */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiChat", user.id);
  const { text } = await parseBody(req, voiceSchema);
  return voiceToDraft(user.id, text);
});
