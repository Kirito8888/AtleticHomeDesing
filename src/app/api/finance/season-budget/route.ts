import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { seasonBudgetSchema } from "@/lib/finance/season";
import { saveSeasonBudget, seasonBudgetView } from "@/lib/finance/season-service";

/** v1.7 · Presupuesto de la temporada deportiva (?season=AAAA) con previsión. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { season } = parseQuery(req, z.object({ season: z.coerce.number().int().min(2000).max(2100) }));
  return seasonBudgetView(user.id, season, toIsoDay(today()));
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  return saveSeasonBudget(user.id, await parseBody(req, seasonBudgetSchema));
});
