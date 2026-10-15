import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { curveInputSchema } from "@/lib/training/reference-curves";
import { createCurve, listCurves } from "@/lib/training/reference-curves-service";

/** Catálogo de curvas citadas: globales + las propias (`?test=cmj` filtra por test). */
export const GET = route(async (req) => {
  const user = await requireUser();
  return listCurves(user, req.nextUrl.searchParams.get("test") ?? undefined);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("physioShare", user.id);
  return createCurve(user, await parseBody(req, curveInputSchema));
});
