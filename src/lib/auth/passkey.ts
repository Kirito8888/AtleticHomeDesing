import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { recordEvent, type AuditContext } from "@/lib/security/audit";

/**
 * v1.7 · Llaves de acceso (passkeys, WebAuthn). Resistentes al phishing: la llave solo firma para este
 * dominio y exige verificar a la persona (huella, cara o PIN del dispositivo). En la BD solo queda la
 * clave pública. Cuentan como segundo factor: entrar con una llave no pide el código 2FA.
 */
const CHALLENGE_TTL_MS = 5 * 60_000;

/** Dominio y origen esperados: los de AUTH_URL (o los de la petición en desarrollo). */
export function relyingParty(requestOrigin?: string) {
  const base = env().AUTH_URL ?? requestOrigin;
  if (!base) throw new ApiError(503, "Falta AUTH_URL para las llaves de acceso");
  const u = new URL(base);
  return { rpID: u.hostname, origin: u.origin, rpName: "LifeOS" };
}

const nameSchema = z.string().trim().min(1).max(60);

async function saveChallenge(kind: "REGISTER" | "LOGIN", challenge: string, userId: string | null) {
  // Limpieza perezosa de los caducados
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return prisma.webAuthnChallenge.create({ data: { kind, challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) }, select: { id: true } });
}

/** Un reto se usa una vez: se borra al leerlo. */
async function takeChallenge(id: string, kind: "REGISTER" | "LOGIN", userId: string | null) {
  const c = await prisma.webAuthnChallenge.findUnique({ where: { id } });
  if (c) await prisma.webAuthnChallenge.delete({ where: { id } }).catch(() => undefined);
  if (!c || c.kind !== kind || c.expiresAt < new Date() || (userId && c.userId !== userId)) throw new ApiError(400, "La solicitud de la llave caducó: vuelve a intentarlo");
  return c.challenge;
}

export async function listPasskeys(userId: string) {
  return prisma.passkey.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true } });
}

export async function registrationOptions(userId: string, requestOrigin?: string) {
  const { rpID, rpName } = relyingParty(requestOrigin);
  const [user, existing] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } }),
    prisma.passkey.findMany({ where: { userId }, select: { credentialId: true, transports: true } }),
  ]);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    userID: new TextEncoder().encode(userId),
    attestationType: "none", // no pedimos datos del fabricante
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const { id } = await saveChallenge("REGISTER", options.challenge, userId);
  return { challengeId: id, options };
}

export async function verifyRegistration(userId: string, input: { challengeId: string; name: string; response: RegistrationResponseJSON }, ctx: AuditContext, requestOrigin?: string) {
  const { rpID, origin } = relyingParty(requestOrigin);
  const expectedChallenge = await takeChallenge(input.challengeId, "REGISTER", userId);
  const v = await verifyRegistrationResponse({ response: input.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) throw new ApiError(400, "No se pudo verificar la llave");
  const { credential, credentialBackedUp } = v.registrationInfo;
  const pk = await prisma.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: nameSchema.parse(input.name),
      backedUp: credentialBackedUp,
    },
    select: { id: true },
  });
  await recordEvent(userId, "PASSKEY_ADDED", ctx, input.name);
  return pk;
}

export async function deletePasskey(userId: string, id: string, ctx: AuditContext) {
  const pk = await prisma.passkey.findFirst({ where: { id, userId }, select: { name: true } });
  if (!pk) throw new ApiError(404, "Llave no encontrada");
  await prisma.passkey.delete({ where: { id } });
  await recordEvent(userId, "PASSKEY_REMOVED", ctx, pk.name);
}

/** Reto para entrar sin usuario (la llave sabe de quién es). Pública. */
export async function loginOptions(requestOrigin?: string) {
  const { rpID } = relyingParty(requestOrigin);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const { id } = await saveChallenge("LOGIN", options.challenge, null);
  return { challengeId: id, options };
}

/** Comprueba la firma de la llave y devuelve el usuario dueño (o null). */
export async function verifyLogin(challengeId: string, response: AuthenticationResponseJSON, requestOrigin?: string) {
  const { rpID, origin } = relyingParty(requestOrigin);
  const expectedChallenge = await takeChallenge(challengeId, "LOGIN", null).catch(() => null);
  if (!expectedChallenge) return null;
  const pk = await prisma.passkey.findUnique({ where: { credentialId: response.id } });
  if (!pk) return null;
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: pk.credentialId, publicKey: new Uint8Array(pk.publicKey), counter: pk.counter, transports: pk.transports as AuthenticatorTransportFuture[] },
  }).catch(() => null);
  if (!v?.verified) return null;
  await prisma.passkey.update({ where: { id: pk.id }, data: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date(), backedUp: v.authenticationInfo.credentialBackedUp } });
  return pk.userId;
}
