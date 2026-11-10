import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteBodyComposition, listBodyComposition, saveBodyComposition } from "@/lib/health/isak-service";

// Solo la dueña: sin athleteId ni acceso de la entrenadora.
export const GET = route(async () => {
  const user = await requireUser();
  return { records: await listBodyComposition(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({}).passthrough());
  return saveBodyComposition(user.id, body, "manual");
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { id } = parseQuery(req, z.object({ id: z.string().min(1).max(40) }));
  await deleteBodyComposition(user.id, id);
  return { ok: true };
});
