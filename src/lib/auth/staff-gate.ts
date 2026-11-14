import "server-only";

import { staffSecondFactorState, type StaffSecondFactorState } from "@/lib/auth/staff-2fa";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** v3.0 D · Estado de la 2FA obligatoria de una cuenta. Solo consulta la BD si es ADMIN o COACH. */
export async function staffGate(user: { id: string; role: string }): Promise<StaffSecondFactorState> {
  if (user.role !== "ADMIN" && user.role !== "COACH") return { kind: "ok" };
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { totpEnabledAt: true, _count: { select: { passkeys: true } } } });
  const hasFactor = Boolean(u?.totpEnabledAt) || (u?._count.passkeys ?? 0) > 0;
  return staffSecondFactorState({ role: user.role, hasFactor, requiredFrom: env().STAFF_2FA_REQUIRED_FROM });
}
