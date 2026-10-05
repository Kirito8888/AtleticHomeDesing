import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { cashflow } from "@/lib/finance/service";

export const GET = route(async (req) => {
  const user = await requireUser();
  const { months } = parseQuery(req, z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }));
  return cashflow(user.id, months);
});
