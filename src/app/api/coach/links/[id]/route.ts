import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { syncRecoveryConsent } from "@/lib/coach/recovery-consent";
import { prisma } from "@/lib/prisma";
import { recordConsent } from "@/lib/privacy/service";
import { auditContext, recordEvent } from "@/lib/security/audit";

const schema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  canPlan: z.boolean().optional(),
  /** Ámbitos que el coach puede ver (solo el atleta los cambia). */
  scopes: z.array(z.enum(["LOAD", "SESSIONS", "RECOVERY", "PLANNING", "REPORTS"])).max(5).optional(),
});

/**
 * El atleta acepta/revoca y decide si el coach puede planificar.
 * El coach solo puede revocar su propio vínculo.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/coach/links/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const data = await parseBody(req, schema);
  const link = await prisma.coachAthlete.findUnique({ where: { id } });
  if (!link || (link.athleteId !== user.id && link.coachId !== user.id)) throw new ApiError(404, "No encontrado");

  const isAthlete = link.athleteId === user.id;
  if (!isAthlete && (data.status === "ACTIVE" || data.canPlan !== undefined || data.scopes !== undefined)) {
    throw new ApiError(403, "Solo el atleta puede aceptar o conceder permisos");
  }
  const updated = await prisma.coachAthlete.update({
    where: { id },
    data: {
      ...data,
      scopes: data.scopes ? [...new Set(data.scopes)] : undefined,
      acceptedAt: data.status === "ACTIVE" && !link.acceptedAt ? new Date() : undefined,
    },
  });
  if (data.scopes) {
    await recordEvent(user.id, "COACH_SCOPES_CHANGED", auditContext(req.headers), data.scopes.join(", ") || "ninguno");
  }
  // Salud (art. 9): activar «Recuperación y lesiones» es un acto expreso que queda como consentimiento; quitarlo (o revocar) lo retira
  if (isAthlete && (data.scopes || data.status === "REVOKED")) {
    await syncRecoveryConsent(user.id, auditContext(req.headers), Boolean(data.scopes?.includes("RECOVERY")) && !link.scopes.includes("RECOVERY") && updated.status === "ACTIVE");
  }
  // v1.7 · Consentimiento del atleta: aceptar el vínculo lo concede; revocarlo lo retira
  if (isAthlete && data.status) await recordConsent(user.id, "COACH", data.status === "ACTIVE", auditContext(req.headers));
  return updated;
});
