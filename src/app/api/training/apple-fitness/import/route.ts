import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { ingestWorkouts } from "@/lib/apple-fitness/inbox-service";
import { workoutSchema } from "@/lib/apple-fitness/payload";
import { requireUser } from "@/lib/auth/session";

const schema = z.object({ workouts: z.array(workoutSchema).min(1).max(500) });

/**
 * Entrenos leídos del export.xml de Salud en el navegador (con sesión, sin token). Mismo destino que el Atajo: la bandeja de
 * borradores de /training (`APPLE_FITNESS`, privada); nada entra en el diario sin aceptar. Idempotente: reimportar no duplica.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("import", user.id);
  const { workouts } = await parseBody(req, schema);
  return ingestWorkouts(user.id, workouts);
});
