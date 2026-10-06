import { z } from "zod";

import { changePassword } from "@/lib/account/service";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { passwordSchema } from "@/lib/auth/users";

/** Cambia la contraseña. Todas las sesiones (también esta) quedan cerradas. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }));
  await changePassword(user.id, body.currentPassword, body.newPassword);
  return { ok: true, signedOut: true };
});
