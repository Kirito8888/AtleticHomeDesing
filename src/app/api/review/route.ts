import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { reviewSchema } from "@/lib/review/review";
import { getReview, saveReview } from "@/lib/review/service";

/** v1.8 · Revisión semanal: resumen de la semana y las tres respuestas. */
export const GET = route(async () => {
  const user = await requireUser();
  return getReview(user.id);
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  return saveReview(user.id, await parseBody(req, reviewSchema));
});
