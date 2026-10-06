import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setAlias } from "@/lib/training/rm-service";

const schema = z.object({
  planName: z.string().trim().min(2).max(120),
  rmKey: z.string().max(120).nullish(),
  exerciseId: z.string().max(40).nullish(),
});

/** Recuerda cómo se llama en el plan un ejercicio de la tabla de RM o del catálogo. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseBody(req, schema);
  return setAlias(user.id, b.planName, { rmKey: b.rmKey, exerciseId: b.exerciseId });
});
