import "server-only";

import { prisma } from "@/lib/prisma";
import { recordConsent } from "@/lib/privacy/service";
import type { AuditContext } from "@/lib/security/audit";

/** Propósito del consentimiento para que la entrenadora o el club vean recuperación y lesiones (art. 9.2.a RGPD). */
export const COACH_RECOVERY = "COACH_RECOVERY" as const;

/**
 * Atletas (de las pedidas) cuyo último consentimiento `COACH_RECOVERY` está concedido. Sin él, el ámbito
 * `RECOVERY` de un vínculo o club no da acceso (vínculos anteriores con la casilla premarcada incluidos).
 */
export async function recoveryConsented(athleteIds: string[]): Promise<Set<string>> {
  if (!athleteIds.length) return new Set();
  const rows = await prisma.consent.findMany({
    where: { userId: { in: athleteIds }, purpose: COACH_RECOVERY },
    orderBy: { createdAt: "desc" },
    distinct: ["userId"],
    select: { userId: true, granted: true },
  });
  return new Set(rows.filter((r) => r.granted).map((r) => r.userId));
}

/** Vínculos y membresías ACTIVE de la atleta con RECOVERY marcado; si no ha confirmado, se le pide confirmación. */
export async function pendingRecoveryConfirmation(athleteId: string): Promise<boolean> {
  const [links, members] = await Promise.all([
    prisma.coachAthlete.count({ where: { athleteId, status: "ACTIVE", scopes: { has: "RECOVERY" } } }),
    prisma.orgMember.count({ where: { userId: athleteId, role: "ATHLETE", status: "ACTIVE", scopes: { has: "RECOVERY" } } }),
  ]);
  if (!links && !members) return false;
  return !(await recoveryConsented([athleteId])).has(athleteId);
}

/**
 * Tras cambiar los ámbitos de la atleta: si activa RECOVERY de forma expresa → consentimiento concedido;
 * si ya no queda ningún vínculo o club activo con RECOVERY → consentimiento retirado.
 */
export async function syncRecoveryConsent(athleteId: string, ctx: AuditContext, added: boolean) {
  const consented = (await recoveryConsented([athleteId])).has(athleteId);
  if (added) {
    if (!consented) await recordConsent(athleteId, COACH_RECOVERY, true, ctx);
    return;
  }
  const [links, members] = await Promise.all([
    prisma.coachAthlete.count({ where: { athleteId, status: "ACTIVE", scopes: { has: "RECOVERY" } } }),
    prisma.orgMember.count({ where: { userId: athleteId, role: "ATHLETE", status: "ACTIVE", scopes: { has: "RECOVERY" } } }),
  ]);
  if (consented && !links && !members) await recordConsent(athleteId, COACH_RECOVERY, false, ctx);
}
