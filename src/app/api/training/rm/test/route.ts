import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getPrefs } from "@/lib/rules/prefs-service";
import { nameKey, testDecision } from "@/lib/training/rm";
import { addRm, currentRms } from "@/lib/training/rm-service";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  kg: z.number().positive().max(500),
  reps: z.number().int().min(1).max(20),
  apply: z.boolean().default(false),
});

/** Serie de test → RM estimada (Epley); con apply=true la guarda si cambia ≥ el umbral. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  const [rms, prefs] = await Promise.all([currentRms(user.id), getPrefs(user.id)]);
  const current = rms.find((r) => r.key === nameKey(body.name)) ?? null;
  const d = testDecision(current?.kg ?? null, body.kg, body.reps, prefs.rmTestThreshold);
  let saved = false;
  if (body.apply && d.update) {
    await addRm(user.id, { name: current?.name ?? body.name, kg: d.estimated, perHand: current?.perHand, source: "TEST" });
    saved = true;
  }
  return { ...d, current: current?.kg ?? null, threshold: prefs.rmTestThreshold, saved };
});
