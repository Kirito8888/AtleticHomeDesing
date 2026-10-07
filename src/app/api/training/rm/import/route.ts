import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { importRms, rmsFromPlan } from "@/lib/training/rm-service";

/** RM que trae el anexo «Mi tabla de RM» del plan importado (vista previa). */
export const GET = route(async () => {
  const user = await requireUser();
  return rmsFromPlan(user.id);
});

const schema = z.object({
  items: z.array(z.object({ name: z.string().trim().min(2).max(80), kg: z.number().positive().max(500), perHand: z.boolean() })).min(1).max(100),
});

/** Guarda las RM elegidas de la vista previa. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return importRms(user.id, (await parseBody(req, schema)).items);
});
