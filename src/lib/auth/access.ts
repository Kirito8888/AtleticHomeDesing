import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { recordEvent, type AuditContext } from "@/lib/security/audit";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";

/**
 * v1.9 · Acceso solo con permiso del autor: invitaciones de un solo uso, aceptación de las
 * condiciones de uso, suspensión de cuentas y restablecimiento de contraseña sin email.
 * Los tokens se generan como los de los enlaces compartidos: 32 bytes y solo el SHA-256 en la BD.
 */

import { TERMS_VERSION } from "@/lib/auth/constants";

export { TERMS_VERSION };

const INVITE_DAYS = { min: 1, max: 30, default: 7 };
const RESET_MINUTES = 60;

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email no válido").nullish().or(z.literal("").transform(() => null)),
  role: z.enum(["ATHLETE", "COACH"]).default("ATHLETE"),
  days: z.number().int().min(INVITE_DAYS.min).max(INVITE_DAYS.max).default(INVITE_DAYS.default),
  note: z.string().trim().max(120).nullish(),
});

/** URL pública de la instalación (AUTH_URL) para construir los enlaces; si falta, relativa. */
export function publicUrl(path: string) {
  const base = env().AUTH_URL?.replace(/\/$/, "") ?? "";
  return `${base}${path}`;
}

export async function createInvitation(adminId: string, input: z.infer<typeof invitationSchema>, ctx: AuditContext = {}) {
  if (input.email && (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }))) {
    throw new ApiError(409, "Ya hay una cuenta con ese email");
  }
  const { token, hash } = newShareToken();
  const inv = await prisma.invitation.create({
    data: { tokenHash: hash, email: input.email ?? null, role: input.role, note: input.note ?? null, createdById: adminId, expiresAt: new Date(Date.now() + input.days * 864e5) },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  await recordEvent(adminId, "INVITATION_CREATED", ctx, input.email ? `para ${input.email}` : "sin email");
  // El token solo se devuelve ahora: después no se puede recuperar
  return { ...inv, url: publicUrl(`/register?invite=${token}`) };
}

/** Invitación vigente para ese token (o null). No revela por qué no vale. */
export async function findInvitation(token: string | null | undefined) {
  if (!token || !isShareToken(token)) return null;
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashShareToken(token) } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

export async function listInvitations() {
  return prisma.invitation.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, note: true, expiresAt: true, createdAt: true },
  });
}

export async function revokeInvitation(id: string) {
  const { count } = await prisma.invitation.deleteMany({ where: { id, usedAt: null } });
  if (!count) throw new ApiError(404, "Invitación no encontrada o ya usada");
}

// Condiciones de uso ------------------------------------------------------------------------------

export async function hasAcceptedTerms(userId: string) {
  const last = await prisma.consent.findFirst({ where: { userId, purpose: "TERMS" }, orderBy: { createdAt: "desc" }, select: { version: true, granted: true } });
  return Boolean(last?.granted && last.version === TERMS_VERSION);
}

export async function acceptTerms(userId: string, ctx: AuditContext = {}) {
  await prisma.consent.createMany({
    data: [
      { userId, purpose: "TERMS", version: TERMS_VERSION, granted: true },
      { userId, purpose: "PRIVACY", version: TERMS_VERSION, granted: true },
    ],
  });
  await recordEvent(userId, "TERMS_ACCEPTED", ctx, `condiciones ${TERMS_VERSION}`);
}

// Administración de cuentas -------------------------------------------------------------------------

/** Listado para el panel: sin ningún dato de salud ni de contenido. */
export async function listUsersForAdmin() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      suspendedAt: true,
      lockedUntil: true,
      demoExpiresAt: true,
      totpEnabledAt: true,
      _count: { select: { passkeys: true } },
      telegramLink: { select: { enabled: true } },
    },
  });
  const lastLogins = await prisma.securityEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, type: { in: ["LOGIN_SUCCESS", "PASSKEY_LOGIN"] } },
    _max: { createdAt: true },
  });
  return users.map((u) => ({
    ...u,
    secondFactor: Boolean(u.totpEnabledAt) || u._count.passkeys > 0,
    lastLoginAt: lastLogins.find((l) => l.userId === u.id)?._max.createdAt ?? null,
  }));
}

async function otherUser(adminId: string, userId: string) {
  if (adminId === userId) throw new ApiError(400, "No puedes hacerlo con tu propia cuenta");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!u) throw new ApiError(404, "Usuario no encontrado");
  return u;
}

/** Suspender: no puede entrar y sus sesiones abiertas caen (sube sessionVersion). No borra datos. */
export async function suspendUser(adminId: string, userId: string, ctx: AuditContext = {}) {
  const u = await otherUser(adminId, userId);
  await prisma.user.update({ where: { id: u.id }, data: { suspendedAt: new Date(), sessionVersion: { increment: 1 } } });
  await recordEvent(u.id, "ACCOUNT_SUSPENDED", ctx, "por la administración");
}

export async function reactivateUser(adminId: string, userId: string, ctx: AuditContext = {}) {
  const u = await otherUser(adminId, userId);
  await prisma.user.update({ where: { id: u.id }, data: { suspendedAt: null, failedLogins: 0, lockedUntil: null } });
  await recordEvent(u.id, "ACCOUNT_REACTIVATED", ctx, "por la administración");
}

/** Enlace de un solo uso (1 h) para poner una contraseña nueva. Invalida los anteriores sin usar. */
export async function issuePasswordReset(adminId: string, userId: string, ctx: AuditContext = {}) {
  const u = await otherUser(adminId, userId);
  const { token, hash } = newShareToken();
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId: u.id, usedAt: null } }),
    prisma.passwordReset.create({ data: { userId: u.id, tokenHash: hash, createdById: adminId, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } }),
  ]);
  await recordEvent(u.id, "PASSWORD_RESET_ISSUED", ctx, "enlace generado por la administración");
  return { url: publicUrl(`/reset?token=${token}`), expiresInMinutes: RESET_MINUTES };
}

export async function findPasswordReset(token: string | null | undefined) {
  if (!token || !isShareToken(token)) return null;
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: hashShareToken(token) }, include: { user: { select: { email: true, suspendedAt: true } } } });
  if (!r || r.usedAt || r.expiresAt < new Date() || r.user.suspendedAt) return null;
  return r;
}

export const resetSchema = z.object({ token: z.string().min(1).max(100), password: passwordSchema });

/** Pone la contraseña nueva, gasta el enlace y cierra todas las sesiones de esa cuenta. */
export async function resetPassword(token: string, password: string, ctx: AuditContext = {}) {
  const r = await findPasswordReset(token);
  if (!r) throw new ApiError(400, "El enlace no es válido o ha caducado. Pide otro a la administración.");
  const { count } = await prisma.passwordReset.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!count) throw new ApiError(400, "El enlace ya se ha usado");
  await prisma.user.update({
    where: { id: r.userId },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await recordEvent(r.userId, "PASSWORD_RESET_USED", ctx);
  return { email: r.user.email };
}
