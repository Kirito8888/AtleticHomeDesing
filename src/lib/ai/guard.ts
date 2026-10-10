import "server-only";

import { aiAvailable } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Comprueba, antes de enviar nada a la IA, que el dueño de los datos (`dataOwnerId`, no
 * necesariamente quien hace la petición: un coach genera informes con datos del atleta) tiene
 * una IA disponible (la suya o la del servidor) y ha autorizado su uso.
 */
export async function assertAiAllowed(dataOwnerId: string): Promise<void> {
  const owner = await prisma.user.findUnique({ where: { id: dataOwnerId }, select: { aiConsentAt: true, processingRestrictedAt: true } });
  if (owner?.processingRestrictedAt) throw new ApiError(403, "Tratamiento limitado (Ajustes → Privacidad): no se envía nada a la IA", { code: "restricted" });
  if (!(await aiAvailable(dataOwnerId))) {
    throw new ApiError(503, "Configura tu IA en Ajustes → IA (tu propia clave de Google, OpenAI, Anthropic o un modelo local)", { code: "ai_not_configured" });
  }
  if (!owner?.aiConsentAt) {
    throw new ApiError(403, "Activa el consentimiento de IA en Ajustes → IA para usar Atlenza IA", { code: "ai_consent_required" });
  }
}
