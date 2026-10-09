import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addHealthLog, deleteHealthLog } from "@/lib/health/women-service";

/** Registro cifrado: cribado, analítica, suelo pélvico o descanso de la píldora. */
export const POST = route(async (req) => {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return addHealthLog(user.id, body);
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { id } = parseQuery(req, z.object({ id: z.string().min(1).max(40) }));
  await deleteHealthLog(user.id, id);
  return { ok: true };
});
