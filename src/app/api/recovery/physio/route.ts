import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { protocolBody } from "@/lib/recovery/physio-protocol";
import { createProtocol, listOwn, listShared, shareableAthletes } from "@/lib/recovery/physio-service";

/** Entrenadora: mis protocolos y atletas a las que puedo compartir. Atleta: lo compartido conmigo. */
export const GET = route(async () => {
  const user = await requireUser();
  const shared = await listShared(user);
  if (user.role !== "COACH") return { own: [], athletes: [], shared };
  return { own: await listOwn(user), athletes: await shareableAthletes(user), shared };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("physioShare", user.id);
  return createProtocol(user, await parseBody(req, protocolBody));
});
