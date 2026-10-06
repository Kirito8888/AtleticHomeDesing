import { z } from "zod";

import { deleteAccount } from "@/lib/account/service";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Elimina la cuenta y todos sus datos. Exige contraseña y escribir "ELIMINAR". */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ password: z.string().min(1).max(200), confirm: z.literal("ELIMINAR") }));
  await deleteAccount(user.id, body.password);
  return { ok: true };
});
