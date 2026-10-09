import "server-only";

import type { SecurityEventType } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push/service";
import { clientIp } from "@/lib/rate-limit";

import { chainKey, eventHash, verifyChain } from "./audit-chain";

let key: Buffer | null | undefined;
/** Clave de la cadena: derivada de AUTH_SECRET. Sin AUTH_SECRET (tests, build) no se encadena. */
function auditKey(): Buffer | null {
  if (key === undefined) key = env().AUTH_SECRET ? chainKey(env().AUTH_SECRET!) : null;
  return key;
}

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
/**
 * v1.7 · Alertas de seguridad: estos eventos avisan por push al dueño de la cuenta (sin datos del
 * evento en el texto de la notificación más allá de qué pasó). El inicio de sesión ya avisa por su cuenta.
 */
export const ALERTS: Partial<Record<SecurityEventType, string>> = {
  ACCOUNT_LOCKED: "Tu cuenta se ha bloqueado 15 min por varios intentos fallidos.",
  PASSWORD_CHANGED: "Se ha cambiado tu contraseña.",
  EMAIL_CHANGED: "Se ha cambiado el email de tu cuenta.",
  TOTP_DISABLED: "Se ha desactivado la verificación en dos pasos.",
  PASSKEY_ADDED: "Se ha añadido una llave de acceso a tu cuenta.",
  PASSKEY_REMOVED: "Se ha quitado una llave de acceso de tu cuenta.",
  DATA_EXPORTED: "Se han descargado tus datos.",
  SHARE_LINK_CREATED: "Se ha creado un enlace para compartir tus datos.",
  SESSIONS_REVOKED: "Se ha cerrado la sesión en todos tus dispositivos.",
};

export async function recordEvent(userId: string, type: SecurityEventType, ctx: AuditContext = {}, detail?: string) {
  try {
    const data = { userId, type, ip: ctx.ip === "unknown" || !ctx.ip ? null : ctx.ip, userAgent: ctx.userAgent ?? null, detail: detail?.slice(0, 300) ?? null, createdAt: new Date() };
    const k = auditKey();
    if (!k) {
      await prisma.securityEvent.create({ data });
      return;
    }
    // Un evento a la vez por usuario (bloqueo de transacción) para que la cadena no se bifurque.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"audit:" + userId}))`;
      const last = await tx.securityEvent.findFirst({ where: { userId, hash: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { hash: true } });
      const prevHash = last?.hash ?? null;
      await tx.securityEvent.create({ data: { ...data, prevHash, hash: eventHash(k, prevHash, data) } });
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar", type, err);
  }
  const alert = ALERTS[type];
  if (alert) void sendToUser(userId, { title: "LifeOS · seguridad", body: `${alert} Si no has sido tú, revisa Ajustes → Seguridad.`, url: "/settings", tag: `sec-${type}` }).catch(() => undefined);
}

/** Días que se conserva el registro (por defecto; RETENTION_AUDIT_DAYS lo cambia). */
export const AUDIT_RETENTION_DAYS = 180;

export function recentEvents(userId: string, take = 30) {
  return prisma.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, ip: true, userAgent: true, detail: true, createdAt: true },
  });
}

/** v1.7 · ¿La cadena de auditoría de este usuario está íntegra? (para «Actividad reciente» y el estado del servidor). */
export async function auditIntegrity(userId: string) {
  const k = auditKey();
  if (!k) return { ok: true as const, checked: 0 };
  const events = await prisma.securityEvent.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return verifyChain(k, events);
}
