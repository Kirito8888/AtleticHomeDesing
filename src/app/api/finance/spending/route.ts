import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { periodWindow } from "@/lib/finance/ledger";
import { spendingByCategory } from "@/lib/finance/service";

/** Gasto por categoría. Por defecto, el mes en curso. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ from: isoDate.optional(), to: isoDate.optional() }));
  const month = periodWindow("MONTHLY", new Date());
  return spendingByCategory(
    user.id,
    q.from ? dateOnly(q.from) : month.start,
    q.to ? dateOnly(q.to) : month.end,
  );
});
