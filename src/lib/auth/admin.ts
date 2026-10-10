import "server-only";

import { ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** v1.8 · ¿Tiene la cuenta un segundo factor (2FA o llave de acceso)? */
export async function hasSecondFactor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true, _count: { select: { passkeys: true } } } });
  return Boolean(u?.totpEnabledAt) || (u?._count.passkeys ?? 0) > 0;
}

/**
 * Administración: además del rol, exige 2FA o una llave de acceso. Quien administra el servidor
 * puede ver el estado, crear cuentas demo y volver a cifrar: una contraseña sola no basta.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo para administración");
  if (!(await hasSecondFactor(user.id))) throw new ApiError(403, "Activa la verificación en dos pasos o una llave de acceso para usar la administración (Ajustes → Seguridad).", { code: "second_factor" });
  return user;
}
