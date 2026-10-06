import "server-only";

import { gemini } from "@/lib/ai/gemini";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Comprueba, antes de enviar nada a Google, que hay clave y que el dueño de
 * los datos (`dataOwnerId`, no necesariamente quien hace la petición: un coach
 * genera informes con datos del atleta) ha autorizado el uso de Gemini.
 */
export async function assertAiAllowed(dataOwnerId: string): Promise<void> {
  gemini(); // 503 si falta GEMINI_API_KEY
  const owner = await prisma.user.findUnique({ where: { id: dataOwnerId }, select: { aiConsentAt: true } });
  if (!owner?.aiConsentAt) {
    throw new ApiError(403, "Activa el consentimiento de IA en Ajustes para usar Astras AI", { code: "ai_consent_required" });
  }
}
