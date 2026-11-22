import "server-only";

import { prisma } from "@/lib/prisma";
import { assertNotRestricted, isRestricted } from "@/lib/privacy/service";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";

/** Propósito del token personal de envío del Atajo de iOS (un solo token activo por propósito y usuaria). */
export const APPLE_PURPOSE = "APPLE_FITNESS";

/** Genera (o sustituye: el anterior deja de valer) el token. Se devuelve en claro solo aquí; en la BD queda su SHA-256. */
export async function createAppleToken(userId: string): Promise<string> {
  await assertNotRestricted(userId, "crear un token de envío");
  const { token, hash } = newShareToken();
  await prisma.$transaction([
    prisma.personalToken.deleteMany({ where: { userId, purpose: APPLE_PURPOSE } }),
    prisma.personalToken.create({ data: { userId, purpose: APPLE_PURPOSE, tokenHash: hash } }),
  ]);
  return token;
}

export async function revokeAppleToken(userId: string) {
  await prisma.personalToken.deleteMany({ where: { userId, purpose: APPLE_PURPOSE } });
}

export async function appleTokenStatus(userId: string) {
  const t = await prisma.personalToken.findUnique({ where: { userId_purpose: { userId, purpose: APPLE_PURPOSE } }, select: { createdAt: true, lastUsedAt: true } });
  return t ? { active: true, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null } : { active: false, createdAt: null, lastUsedAt: null };
}

/** Dueña del token, o null si no existe, fue revocado o la cuenta tiene el tratamiento limitado (art. 18). Anota el último uso. */
export async function userForAppleToken(token: string): Promise<{ id: string; role: string } | null> {
  if (!isShareToken(token)) return null;
  const t = await prisma.personalToken.findUnique({
    where: { tokenHash: hashShareToken(token) },
    select: { id: true, purpose: true, user: { select: { id: true, role: true } } },
  });
  if (!t || t.purpose !== APPLE_PURPOSE || (await isRestricted(t.user.id))) return null;
  await prisma.personalToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
  return t.user;
}

/** ¿Este token en claro es el activo de esta usuaria? No anota uso ni revela si pertenece a otra persona. */
export async function ownsAppleToken(userId: string, token: string): Promise<boolean> {
  if (!isShareToken(token)) return false;
  const t = await prisma.personalToken.findUnique({ where: { tokenHash: hashShareToken(token) }, select: { userId: true, purpose: true } });
  return t?.userId === userId && t.purpose === APPLE_PURPOSE;
}
