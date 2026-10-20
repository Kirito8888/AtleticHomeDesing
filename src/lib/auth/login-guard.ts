import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { countPersistent, rateLimitPersistent, resetPersistent } from "@/lib/rate-limit-db";

/**
 * Límites del inicio de sesión por contraseña. El bloqueo ya no es una marca en la cuenta (cualquiera, rotando de IP,
 * podía bloquear la de otra persona): se cuentan los FALLOS por email (exista o no, así no se revela) y por email+IP.
 * - email+IP: 5 fallos/15 min cierran el paso a ESA IP.
 * - email global: 20 fallos/15 min cierran el paso solo a dispositivos no reconocidos; quien ya entró antes desde ese
 *   navegador (cookie firmada) no nota nada. Antes, retraso progresivo para los no reconocidos.
 */
export const LOGIN_FAIL = {
  perIp: { limit: 5, windowMs: 15 * 60_000 },
  global: { limit: 20, windowMs: 15 * 60_000 },
} as const;

const ipKey = (email: string, ip: string) => `loginfail:${email}:${ip}`;
const globalKey = (email: string) => `loginfail:${email}`;

/** Retraso progresivo según los fallos recientes del email: 0 hasta 3, luego 1, 2, 4 s y tope en 8 s. */
export function loginDelayMs(fails: number): number {
  if (fails <= 3) return 0;
  return Math.min(8000, 1000 * 2 ** (fails - 4));
}

export interface LoginGate {
  blocked: boolean;
  delayMs: number;
}

export async function loginGate(email: string, ip: string, knownDevice: boolean): Promise<LoginGate> {
  const [perIp, global] = await Promise.all([
    countPersistent(ipKey(email, ip), LOGIN_FAIL.perIp.windowMs),
    countPersistent(globalKey(email), LOGIN_FAIL.global.windowMs),
  ]);
  if (perIp >= LOGIN_FAIL.perIp.limit) return { blocked: true, delayMs: 0 };
  if (!knownDevice && global >= LOGIN_FAIL.global.limit) return { blocked: true, delayMs: 0 };
  return { blocked: false, delayMs: knownDevice ? 0 : loginDelayMs(global) };
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await Promise.all([
    rateLimitPersistent(ipKey(email, ip), Number.MAX_SAFE_INTEGER, LOGIN_FAIL.perIp.windowMs),
    rateLimitPersistent(globalKey(email), Number.MAX_SAFE_INTEGER, LOGIN_FAIL.global.windowMs),
  ]);
}

/** Inicio de sesión correcto: se limpia el contador de esa IP (el global caduca solo, para no regalar intentos al atacante). */
export const clearIpFailures = (email: string, ip: string) => resetPersistent(ipKey(email, ip)).then(() => undefined, () => undefined);

/** Desbloqueo por la administración: borra el contador global del email (los de IP son hashes y caducan en 15 min). */
export const clearGlobalFailures = (email: string) => resetPersistent(globalKey(email)).then(() => undefined, () => undefined);

// Dispositivo reconocido ------------------------------------------------------------------------------

export const deviceCookieName = (email: string) => `atlenza-dev-${createHmac("sha256", "device-name").update(email).digest("hex").slice(0, 12)}`;

/** Firma del dispositivo: ligada al email y a la versión de sesión (cambiar la contraseña o «cerrar todas» la invalida). */
export function deviceToken(email: string, sessionVersion: number): string {
  const secret = process.env.AUTH_SECRET ?? "dev";
  return createHmac("sha256", secret).update(`device|${email}|${sessionVersion}`).digest("base64url");
}

export function isKnownDevice(email: string, sessionVersion: number, cookie: string | undefined): boolean {
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(deviceToken(email, sessionVersion));
  return a.length === b.length && timingSafeEqual(a, b);
}
