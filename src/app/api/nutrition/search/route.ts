import { z } from "zod";

import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { searchFoods } from "@/lib/nutrition/service";

const query = z.object({
  q: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

/** Búsqueda de productos (p.ej. "hacendado yogur") en OpenFoodFacts España. */
export const GET = route(async (req) => {
  await requireUser();
  const { q, page } = parseQuery(req, query);
  return searchFoods(q, page);
});
