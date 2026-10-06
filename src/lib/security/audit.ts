import "server-only";

import type { SecurityEventType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

export interface AuditContext {
  ip?: string;
  userAgent?: string;
}

/** IP y navegador de la petición, para el registro de auditoría. */
export function auditContext(headers: Headers): AuditContext {
  return { ip: clientIp(headers), userAgent: headers.get("user-agent")?.slice(0, 300) ?? undefined };
}

/**
 * Anota un evento de seguridad del usuario. Nunca rompe la operación que lo
 * origina: si la BD falla aquí, se registra en el log y se sigue.
 */
export async function recordEvent(userId: string, type: SecurityEventType, ctx: AuditContext = {}, detail?: string) {
  try {
    await prisma.securityEvent.create({
      data: { userId, type, ip: ctx.ip === "unknown" ? null : ctx.ip, userAgent: ctx.userAgent, detail: detail?.slice(0, 300) },
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar", type, err);
  }
}

export const AUDIT_RETENTION_DAYS = 180;

export function recentEvents(userId: string, take = 30) {
  return prisma.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, ip: true, userAgent: true, detail: true, createdAt: true },
  });
}
