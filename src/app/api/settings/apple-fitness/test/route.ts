import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { runConnectionTest } from "@/lib/apple-fitness/connection-test";
import { ownsAppleToken } from "@/lib/apple-fitness/token-service";
import { requireUser } from "@/lib/auth/session";

/**
 * «Probar envío» (v3.1 C): comprueba que el token pegado es el tuyo y pasa un payload sintético por los mismos esquemas y
 * normalizadores que los envíos reales (unidades, hora de Madrid cerca de medianoche, deporte). No escribe entrenos ni métricas.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { token } = await parseBody(req, z.object({ token: z.string().trim().min(8).max(200) }));
  // Mensaje único: no distingue «no existe» de «es de otra persona»
  if (!(await ownsAppleToken(user.id, token))) throw new ApiError(400, "Token no válido para tu cuenta");
  return runConnectionTest(user.id);
});
