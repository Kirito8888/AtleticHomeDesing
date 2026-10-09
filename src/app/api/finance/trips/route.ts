import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { tripSchema } from "@/lib/finance/trips";
import { createTrip, listTrips } from "@/lib/finance/trips-service";

/** Viajes de competición: lista con gastado frente a presupuesto · crear. */
export const GET = route(async () => {
  const user = await requireUser();
  return listTrips(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createTrip(user.id, await parseBody(req, tripSchema));
});
