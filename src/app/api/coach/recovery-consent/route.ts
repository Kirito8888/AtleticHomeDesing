import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { pendingRecoveryConfirmation, syncRecoveryConsent } from "@/lib/coach/recovery-consent";
import { prisma } from "@/lib/prisma";
import { auditContext } from "@/lib/security/audit";

/** ¿Tiene vínculos o clubes con «Recuperación y lesiones» marcado sin haberlo confirmado? */
export const GET = route(async () => {
  const user = await requireUser();
  return { pending: await pendingRecoveryConfirmation(user.id) };
});

/**
 * Vínculos anteriores a v3.0 traían «Recuperación y lesiones» premarcado (no es consentimiento válido, art. 9.2.a RGPD).
 * `confirm: true` lo confirma de forma expresa; `confirm: false` lo quita de todos sus vínculos y clubes.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { confirm } = await parseBody(req, z.object({ confirm: z.boolean() }));
  const ctx = auditContext(req.headers);
  if (!confirm) {
    const [links, members] = await Promise.all([
      prisma.coachAthlete.findMany({ where: { athleteId: user.id, scopes: { has: "RECOVERY" } }, select: { id: true, scopes: true } }),
      prisma.orgMember.findMany({ where: { userId: user.id, role: "ATHLETE", scopes: { has: "RECOVERY" } }, select: { id: true, scopes: true } }),
    ]);
    await prisma.$transaction([
      ...links.map((l) => prisma.coachAthlete.update({ where: { id: l.id }, data: { scopes: l.scopes.filter((s) => s !== "RECOVERY") } })),
      ...members.map((m) => prisma.orgMember.update({ where: { id: m.id }, data: { scopes: m.scopes.filter((s) => s !== "RECOVERY") } })),
    ]);
  }
  await syncRecoveryConsent(user.id, ctx, confirm);
  return { ok: true, pending: await pendingRecoveryConfirmation(user.id) };
});
