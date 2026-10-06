import { z } from "zod";

import { verifyCurrentPassword } from "@/lib/account/service";
import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { confirmTotpSetup, disableTotp, startTotpSetup, totpStatus, verifySecondFactor } from "@/lib/security/totp";

const password = z.string().min(1).max(200);

/** Estado de la verificación en dos pasos. */
export const GET = route(async () => {
  const user = await requireUser();
  return totpStatus(user.id);
});

/** Paso 1 (con contraseña): genera el secreto y el QR. No activa nada todavía. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ password }));
  await verifyCurrentPassword(user.id, body.password);
  const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
  return startTotpSetup(user.id, email);
});

/** Paso 2: confirma con un código de la app → activa y devuelve los códigos de recuperación (solo esta vez). */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { code } = await parseBody(req, z.object({ code: z.string().trim().min(6).max(10) }));
  const recoveryCodes = await confirmTotpSetup(user.id, code);
  await recordEvent(user.id, "TOTP_ENABLED", auditContext(req.headers));
  return { enabled: true, recoveryCodes };
});

/** Desactivar exige contraseña y un código válido (TOTP o de recuperación). */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ password, code: z.string().trim().min(6).max(20) }));
  await verifyCurrentPassword(user.id, body.password);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, totpSecret: true, totpLastStep: true, totpEnabledAt: true } });
  if (!u.totpEnabledAt) throw new ApiError(400, "La verificación en dos pasos no está activada");
  if (!(await verifySecondFactor(u, body.code))) throw new ApiError(403, "El código no es correcto");
  await disableTotp(user.id);
  await recordEvent(user.id, "TOTP_DISABLED", auditContext(req.headers));
  return { enabled: false };
});
