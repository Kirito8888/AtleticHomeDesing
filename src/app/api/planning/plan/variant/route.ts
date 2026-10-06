import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { setPlanVariant } from "@/lib/planning/plan-import/service";

const schema = z.object({
  code: z.string().regex(/^M\d{1,2}$/),
  variant: z.string().min(1).max(20),
  /** Día de la competición, para las versiones que cuentan hacia atrás (D−5…D). */
  anchorDate: isoDate.nullish(),
});

/** Elige la versión activa de un bloque: crea sus sesiones y retira las de la otra. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  return setPlanVariant(user.id, body.code, body.variant, body.anchorDate);
});
