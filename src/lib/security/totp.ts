import "server-only";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "@/lib/security/recovery-codes";
import { open, seal } from "@/lib/security/secret-box";

const ISSUER = "LifeOS";

function encryptionKey(): string {
  const key = env().TOTP_ENCRYPTION_KEY;
  if (!key) throw new ApiError(503, "La verificación en dos pasos no está configurada en el servidor (falta TOTP_ENCRYPTION_KEY)");
  return key;
}

export const totpConfigured = () => Boolean(env().TOTP_ENCRYPTION_KEY);

/**
 * Paso 1: genera un secreto nuevo (pendiente hasta confirmarlo con un código)
 * y devuelve la URI otpauth y su QR (SVG en data URL) para la app de autenticación.
 */
export async function startTotpSetup(userId: string, email: string) {
  const key = encryptionKey();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
  if (user.totpEnabledAt) throw new ApiError(409, "La verificación en dos pasos ya está activada");
  const secret = generateSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: seal(secret, key), totpLastStep: null } });
  const uri = generateURI({ issuer: ISSUER, label: email, secret });
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  // Como data URL para un <img> (la CSP permite img-src data:), sin inyectar HTML.
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return { secret, uri, qrDataUrl };
}

/**
 * Comprueba un TOTP de 6 dígitos (±30 s de margen) y lo "gasta": un código ya
 * usado no vuelve a valer aunque siga dentro de su ventana (anti-reutilización).
 */
async function checkTotp(userId: string, sealedSecret: string, lastStep: number | null, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  const secret = open(sealedSecret, encryptionKey());
  const result = await verify({ secret, token, epochTolerance: 30, afterTimeStep: lastStep ?? undefined });
  // verify() devuelve un tipo común a HOTP y TOTP: timeStep solo existe en TOTP.
  if (!result.valid || !("timeStep" in result)) return false;
  const step = result.timeStep;
  // Guardado condicional: dos logins simultáneos con el mismo código → solo gana uno.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1;
}

async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  return codes;
}

/** Paso 2: el usuario teclea un código de su app; si vale, se activa y se entregan los códigos de recuperación. */
export async function confirmTotpSetup(userId: string, token: string): Promise<string[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (user.totpEnabledAt) throw new ApiError(409, "La verificación en dos pasos ya está activada");
  if (!user.totpSecret) throw new ApiError(400, "Primero genera el código QR");
  if (!(await checkTotp(userId, user.totpSecret, user.totpLastStep, token.trim()))) {
    throw new ApiError(400, "El código no es correcto. Comprueba la hora del móvil y vuelve a probar.");
  }
  await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
  return issueRecoveryCodes(userId);
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
  if (!user.totpEnabledAt) throw new ApiError(400, "La verificación en dos pasos no está activada");
  return issueRecoveryCodes(userId);
}

export async function disableTotp(userId: string) {
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
  ]);
}

export type SecondFactorResult = "totp" | "recovery" | false;

/**
 * Segundo factor en el login: TOTP de 6 dígitos o código de recuperación
 * (que se marca como usado). Devuelve qué se usó, o false.
 */
export async function verifySecondFactor(
  user: { id: string; totpSecret: string | null; totpLastStep: number | null },
  input: string,
): Promise<SecondFactorResult> {
  const value = input.trim();
  if (looksLikeRecoveryCode(value)) {
    const { count } = await prisma.recoveryCode.updateMany({
      where: { userId: user.id, codeHash: hashRecoveryCode(value), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1 ? "recovery" : false;
  }
  if (!user.totpSecret) return false;
  return (await checkTotp(user.id, user.totpSecret, user.totpLastStep, value)) ? "totp" : false;
}

export async function totpStatus(userId: string) {
  const [user, remaining] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return { enabled: user.totpEnabledAt != null, enabledAt: user.totpEnabledAt, recoveryCodesLeft: remaining, configured: totpConfigured() };
}
