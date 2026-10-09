import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { endTrip, startTrip, startTripSchema } from "@/lib/health/safety-service";

/** POST «salgo» (minutos hasta la vuelta, nota y ubicación opcionales) · DELETE «llegué». */
export const POST = route(async (req) => {
  const user = await requireUser();
  return startTrip(user.id, await parseBody(req, startTripSchema));
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await endTrip(user.id);
  return { ok: true };
});
