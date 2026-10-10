import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isoDate, today, toIsoDay } from "@/lib/dates";
import { importCompetitions } from "@/lib/training/diary-service";

/** v1.7 · Competiciones de un calendario (.ics o CSV leído en el navegador): solo se añaden las nuevas. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { events } = await parseBody(req, z.object({ events: z.array(z.object({ title: z.string().trim().min(1).max(200), date: isoDate, location: z.string().max(200).nullable() })).min(1).max(300) }));
  return importCompetitions(user.id, events, toIsoDay(today()));
});
