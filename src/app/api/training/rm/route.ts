import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/dates";
import { addRm, currentRms } from "@/lib/training/rm-service";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  kg: z.number().positive().max(500),
  perHand: z.boolean().optional(),
  effectiveFrom: isoDate.optional(),
});

/** Tabla de RM: vigentes y alta de un valor nuevo (queda el historial). */
export const GET = route(async () => {
  const user = await requireUser();
  return currentRms(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return addRm(user.id, await parseBody(req, schema));
});
