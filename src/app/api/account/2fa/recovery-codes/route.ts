import { z } from "zod";

import { verifyCurrentPassword } from "@/lib/account/service";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { regenerateRecoveryCodes } from "@/lib/security/totp";

/** Genera 10 códigos nuevos (los anteriores dejan de valer). Exige contraseña. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ password: z.string().min(1).max(200) }));
  await verifyCurrentPassword(user.id, body.password);
  return { recoveryCodes: await regenerateRecoveryCodes(user.id) };
});
