import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { listPasskeys, registrationOptions, verifyRegistration } from "@/lib/auth/passkey";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";

/** v1.7 · Llaves de acceso: listar · pedir reto de registro (`{step:"options"}`) · guardar la llave nueva. */
export const GET = route(async () => {
  const user = await requireUser();
  return listPasskeys(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const origin = new URL(req.url).origin;
  const body = await parseBody(
    req,
    z.union([z.object({ step: z.literal("options") }), z.object({ step: z.literal("verify"), challengeId: z.string().max(40), name: z.string().max(60), response: z.record(z.string(), z.unknown()) })]),
  );
  if (body.step === "options") return registrationOptions(user.id, origin);
  return verifyRegistration(user.id, { challengeId: body.challengeId, name: body.name, response: body.response as unknown as RegistrationResponseJSON }, auditContext(req.headers), origin);
});
