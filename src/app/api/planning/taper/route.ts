import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setTaper, taperProposal } from "@/lib/planning/taper-service";

const q = z.object({ eventId: z.string().max(40) });

/** Afinamiento antes de una competición: ver la propuesta · aplicarla o quitarla (reversible). */
export const GET = route(async (req) => {
  const user = await requireUser();
  return taperProposal(user.id, parseQuery(req, q).eventId);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { eventId, apply } = await parseBody(req, q.extend({ apply: z.boolean() }));
  return setTaper(user.id, eventId, apply);
});
