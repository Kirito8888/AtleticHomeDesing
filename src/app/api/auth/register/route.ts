import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { acceptTerms } from "@/lib/auth/access";
import { createUser, registerSchema } from "@/lib/auth/users";
import { clientIp } from "@/lib/rate-limit";
import { auditContext } from "@/lib/security/audit";

/** Como el formulario: hay que aceptar las condiciones y la política de privacidad. */
const apiRegisterSchema = registerSchema.extend({ terms: z.literal(true, { error: "Hay que aceptar las condiciones de uso y la política de privacidad" }) });

const NEUTRAL = { ok: true, message: "Si el email no tenía cuenta, ya está creada: inicia sesión." };

/** Registro por API: siempre ATHLETE (el rol solo lo da una invitación), con las condiciones guardadas y la misma respuesta si el email ya existe. */
export const POST = route(async (req) => {
  await enforceRateLimit("register", clientIp(req.headers));
  const data = registerSchema.parse(await parseBody(req, apiRegisterSchema)); // `terms` ya validado; zod descarta lo que sobra
  try {
    const user = await createUser(data);
    await acceptTerms(user.id, auditContext(req.headers));
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return NextResponse.json(NEUTRAL, { status: 202 });
});
