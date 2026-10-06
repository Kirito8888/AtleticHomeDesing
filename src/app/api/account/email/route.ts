import { z } from "zod";

import { changeEmail } from "@/lib/account/service";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(
    req,
    z.object({ currentPassword: z.string().min(1).max(200), email: z.string().trim().toLowerCase().email("Email no válido") }),
  );
  await changeEmail(user.id, body.currentPassword, body.email, auditContext(req.headers));
  return { ok: true, signedOut: true };
});
