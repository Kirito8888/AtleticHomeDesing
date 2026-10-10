import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { inviteContact } from "@/lib/health/safety-service";

/** Invitar a un contacto de confianza (otra cuenta de Atlenza) por su email. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("comment", user.id);
  const { email } = await parseBody(req, z.object({ email: z.string().trim().email().max(200) }));
  await inviteContact(user.id, email);
  return { ok: true };
});
